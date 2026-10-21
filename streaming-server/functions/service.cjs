'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto'),{Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {PROFILE,MAX_SOURCE_BYTES,MAX_SECONDS,validName,idFor,jobFor,catalogEntry,planFor,ffmpegArgs,rewriteVariant,masterPlaylist,mediaUrl}=require('./media-plan.cjs');
const {run,listOutput}=require('./media-tools.cjs');
const BUCKET='testo-movie-site.firebasestorage.app',DAY_LIMIT=10,ATTEMPT_LIMIT=3,LEASE_MS=11*60*1000;
function createService({db,storage,FieldValue,logger,now=Date.now}){
 const bucket=storage.bucket(BUCKET),lock=db.doc('streamingControl/worker');
 async function getSource(name){try{return(await bucket.file(name).getMetadata())[0];}catch(e){if(Number(e.code)===404)return null;throw e;}}
 async function syncSource(name){
  if(!validName(name))return;
  const metadata=await getSource(name),entry=metadata&&catalogEntry(name,metadata),catalog=db.doc('videoCatalog/'+idFor(name));
  if(!entry){await catalog.delete();return;}
  await catalog.set({...entry,observedAt:now()});
  const custom=metadata.metadata||{},already=custom.streamProfile===PROFILE&&custom.hlsSourceGeneration===String(metadata.generation);
  if(already||!Number.isSafeInteger(Number(metadata.size))||Number(metadata.size)<=0||Number(metadata.size)>MAX_SOURCE_BYTES)return;
  const job=db.doc('streamingJobs/'+jobFor(name,metadata.generation));
  await db.runTransaction(async tx=>{if((await tx.get(job)).exists)return;tx.create(job,{name,generation:String(metadata.generation),status:'queued',attempts:0,createdAt:now()});});
 }
 async function acquire(jobId){
  if(!/^[a-f0-9]{64}$/.test(jobId))return null;
  const ref=db.doc('streamingJobs/'+jobId),day=new Date(now()).toISOString().slice(0,10),budget=db.doc('streamingBudget/'+day),lease=randomUUID();
  return db.runTransaction(async tx=>{
   const [job,held,usage]=await Promise.all([tx.get(ref),tx.get(lock),tx.get(budget)]);if(!job.exists)return null;
   const data=job.data(),expired=data.status==='processing'&&data.leaseUntil<now();
   if((expired||data.status==='failed')&&data.attempts>=ATTEMPT_LIMIT){tx.update(ref,{status:'exhausted',finishedAt:now()});if(held.exists&&held.data().lease===data.lease)tx.delete(lock);return null;}
   if(!['queued','failed'].includes(data.status)&&!expired||data.attempts>=ATTEMPT_LIMIT||held.exists&&held.data().until>now()||(usage.data()?.attempts||0)>=DAY_LIMIT)return null;
   tx.set(lock,{lease,until:now()+LEASE_MS});tx.set(budget,{attempts:(usage.data()?.attempts||0)+1});
   tx.update(ref,{status:'processing',lease,leaseUntil:now()+LEASE_MS,attempts:(data.attempts||0)+1});return{...data,jobId,previousLease:data.lease||null,lease};
  });
 }
 async function finish(job,status,reason=''){
  await db.runTransaction(async tx=>{
   const ref=db.doc('streamingJobs/'+job.jobId),[record,held]=await Promise.all([tx.get(ref),tx.get(lock)]);
   if(record.exists&&record.data().lease===job.lease&&record.data().status==='processing')tx.update(ref,{status,reason,finishedAt:now()});
   if(held.exists&&held.data().lease===job.lease)tx.delete(lock);
  });
 }
 async function readBounded(file,destination){
  let bytes=0;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  const limiter=new Transform({transform(chunk,_encoding,next){bytes+=chunk.length;next(bytes>MAX_SOURCE_BYTES?Error('source-size-limit'):null,chunk);}});
  try{await pipeline(file.createReadStream({validation:'crc32c'}),limiter,require('node:fs').createWriteStream(destination,{flags:'wx'}),{signal:controller.signal});}finally{clearTimeout(timer);}
 }
 async function processJob(jobId){
  const job=await acquire(jobId);if(!job)return false;
  let temporary=null,prefix=null,published=false,status='skipped',reason='source-unavailable';
  try{
   const meta=await getSource(job.name);
   if(!meta||String(meta.generation)!==job.generation||!catalogEntry(job.name,meta))return true;
   if(meta.metadata?.streamProfile===PROFILE&&meta.metadata?.hlsSourceGeneration===job.generation){status='ready';reason='';return true;}
   if(job.previousLease&&/^[a-f0-9-]{36}$/.test(job.previousLease))await bucket.deleteFiles({prefix:'hls/'+PROFILE+'/'+idFor(job.name)+'/'+job.generation+'/'+job.previousLease+'/',force:true});
   if(Number(meta.size)>MAX_SOURCE_BYTES){reason='optimization-size-limit';return true;}
   temporary=await fs.mkdtemp(path.join(os.tmpdir(),'submovie-stream-'));const source=path.join(temporary,'source'),output=path.join(temporary,'out');await fs.mkdir(output);
   await readBounded(bucket.file(job.name,{generation:job.generation}),source);
   const binaries=path.join(__dirname,'.media-bin');
   const probe=JSON.parse(await run(path.join(binaries,'ffprobe'),['-v','error','-max_alloc','268435456','-protocol_whitelist','file','-format_whitelist','mov,matroska,webm,avi,flv,mpeg,mpegts,ogg,asf','-probesize','33554432','-analyzeduration','10000000','-show_streams','-show_format','-of','json',source],{timeout:20000}));
   const plan=planFor(probe);await run(path.join(binaries,'ffmpeg'),ffmpegArgs(source,output,plan),{directory:output,timeout:360000});
   const {names}=await listOutput(output),files=new Set(names),token=randomUUID();
   prefix='hls/'+PROFILE+'/'+idFor(job.name)+'/'+job.generation+'/'+job.lease+'/';
   for(const name of names){if(!/^v\d+(?:_\d{5}\.ts|\.m3u8)$/.test(name))throw Error('output-name-invalid');}
   for(let i=0;i<plan.variants.length;i++){
    const name='v'+i+'.m3u8';if(!files.has(name))throw Error('playlist-missing');
    const text=await fs.readFile(path.join(output,name),'utf8'),seconds=[...text.matchAll(/#EXTINF:([\d.]+)/g)].reduce((sum,m)=>sum+Number(m[1]),0);
    if(!seconds||seconds>MAX_SECONDS+4||seconds>plan.duration+5)throw Error('output-duration-limit');
    await fs.writeFile(path.join(output,name),rewriteVariant(text,files,prefix,BUCKET,token));
   }
   await fs.writeFile(path.join(output,'master.m3u8'),masterPlaylist(plan,prefix,BUCKET,token));
   const uploads=[...names,'master.m3u8'];let next=0;
   async function upload(){while(next<uploads.length){const name=uploads[next++];await bucket.upload(path.join(output,name),{destination:prefix+name,resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:name.endsWith('.ts')?'video/mp2t':'application/vnd.apple.mpegurl',cacheControl:'public,max-age=31536000,immutable',metadata:{firebaseStorageDownloadTokens:token,streamProfile:PROFILE}}});}}
   const uploadResults=await Promise.allSettled(Array.from({length:Math.min(4,uploads.length)},upload));if(uploadResults.some(r=>r.status==='rejected'))throw Error('output-upload-failed');
   const latest=await getSource(job.name),record=await db.doc('streamingJobs/'+job.jobId).get();
   if(!latest||String(latest.generation)!==job.generation||record.data()?.status!=='processing'||record.data()?.lease!==job.lease)throw Error('source-changed');
   // A metageneration precondition prevents overwriting a title, policy or deletion that changed during conversion.
   await bucket.file(job.name).setMetadata({metadata:{...(latest.metadata||{}),hlsUrl:mediaUrl(BUCKET,prefix+'master.m3u8',token),hlsSourceGeneration:job.generation,streamProfile:PROFILE}}, {ifMetagenerationMatch:latest.metageneration,ifGenerationMatch:job.generation});
   published=true;status='ready';reason='';await syncSource(job.name);
  }catch(error){reason=/^[a-z][a-z0-9-]{0,80}$/.test(error.message||'')?error.message:'conversion-failed';status=/source-changed|duration-limit|dimensions-limit|no-video|stream-index|optimization-size/.test(reason)?'skipped':'failed';logger.warn('streaming_job_stopped',{jobId,reason});}
  finally{
   if(prefix&&!published)await bucket.deleteFiles({prefix,force:true}).catch(()=>logger.warn('streaming_cleanup_pending',{jobId}));
   if(temporary)await fs.rm(temporary,{recursive:true,force:true});
   await finish(job,status,reason.slice(0,120));
  }
  return true;
 }
 async function deleted(name,generation){
  if(!validName(name)||!/^\d+$/.test(String(generation)))return;
  // Refreshing rather than blindly deleting protects a newer object with the same path.
  await syncSource(name);
  const ref=db.doc('streamingJobs/'+jobFor(name,generation));
  await db.runTransaction(async tx=>{const job=await tx.get(ref);if(job.exists)tx.update(ref,{status:'cancelled',finishedAt:now()});});
  await bucket.deleteFiles({prefix:'hls/'+PROFILE+'/'+idFor(name)+'/'+generation+'/',force:true});
 }
 async function catalogPage(){
  const checkpoint=db.doc('streamingControl/catalog'),state=(await checkpoint.get()).data()||{};
  let result;
  try{result=await bucket.getFiles({prefix:'videos/',maxResults:100,autoPaginate:false,...(state.pageToken?{pageToken:state.pageToken}:{})});}
  catch(e){if(Number(e.code)===400&&state.pageToken){await checkpoint.set({pageToken:null});return;}throw e;}
  // Four metadata requests at once, bounded independently from encoders.
  let next=0;const files=result[0];async function work(){while(next<files.length){const file=files[next++];await syncSource(file.name);}}
  await Promise.all(Array.from({length:Math.min(4,files.length)},work));
  const pageToken=result[1]?.pageToken||null;await checkpoint.set({pageToken,updatedAt:now()});
  if(!pageToken)await db.doc('performanceStatus/catalog').set({ready:true,schemaVersion:1,updatedAt:now()});
  // Reconcile missed delete events without scanning all catalog entries at once.
  const auditRef=db.doc('streamingControl/catalogAudit'),audit=(await auditRef.get()).data()||{};let q=db.collection('videoCatalog').orderBy('__name__').limit(50);if(audit.after)q=q.startAfter(audit.after);
  const records=await q.get();for(const doc of records.docs){const data=doc.data();if(validName(data.fullPath)&&!await getSource(data.fullPath))await doc.ref.delete();}
  await auditRef.set({after:records.size===50?records.docs.at(-1).id:null});
 }
 async function normalizeComments(){
  const ref=db.doc('streamingControl/comments'),state=(await ref.get()).data()||{};if(state.complete)return;
  let q=db.collection('comments').orderBy('__name__').limit(200);if(state.after)q=q.startAfter(state.after);
  const docs=await q.get();const batch=db.batch();for(const doc of docs.docs)if(!['normal','danmaku'].includes(doc.data().type))batch.update(doc.ref,{type:'normal'});
  await batch.commit();const complete=docs.size<200;await ref.set({after:docs.docs.at(-1)?.id||null,complete});
  if(complete)await db.doc('performanceStatus/comments').set({ready:true,schemaVersion:1,updatedAt:now()});
 }
 async function maintenance(){
  await catalogPage();await normalizeComments();
  // A pending queue survives provider runtime patching, transient event failures and daily limits.
  for(const status of ['processing','queued','failed']){const rows=await db.collection('streamingJobs').where('status','==',status).limit(10).get();for(const doc of rows.docs)if(await processJob(doc.id))return;}
 }
 return{syncSource,processJob,deleted,maintenance,acquire,finish,normalizeComments,catalogPage};
}
module.exports={createService,BUCKET,DAY_LIMIT,ATTEMPT_LIMIT};
