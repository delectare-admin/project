'use strict';
// Independent codebase: does not replace anti-spam or notification functions.
const {initializeApp}=require('firebase-admin/app');
const {getStorage}=require('firebase-admin/storage');
const {onObjectFinalized}=require('firebase-functions/v2/storage');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const logger=require('firebase-functions/logger');
const {spawn}=require('node:child_process');
const {createWriteStream}=require('node:fs');
const {createServer}=require('node:http');
const {pipeline}=require('node:stream/promises');
// Local media input / accurate failure reporting v2
const {mkdtemp,rm,readFile}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
initializeApp();
const BUCKET='testo-movie-site.firebasestorage.app';
const REGION='us-east1';
const options={region:REGION,memory:'1GiB',cpu:1,timeoutSeconds:540,
  minInstances:0,maxInstances:1,concurrency:1};
const ffmpeg=path.join(__dirname,'.media-bin','ffmpeg');
const ffprobe=path.join(__dirname,'.media-bin','ffprobe');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {MAX_VIDEO_BYTES,POLICY_VERSION,validateProbe,invalid:invalidUpload}=require('./upload-policy.cjs');
const {cleanDetails,validateThumbnail}=require('./video-metadata.cjs');
function runMediaTool(binary,args) {
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],shell:false});
  let stdout='',stderr='',timedOut=false,settled=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},95000);
  child.stdout.on('data',data=>{stdout+=data.toString();if(stdout.length>1024*1024)child.kill('SIGKILL');});
  child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-24000);});
  function fail(message){if(settled)return;settled=true;clearTimeout(timer);const error=new Error(message);reject(error);}
  child.once('error',()=>fail('media-tool-start-failed'));
  child.once('close',(code,signal)=>{
   if(timedOut)return fail('media-tool-timeout');
   if(signal)return fail('media-tool-crashed');
   if(code!==0)return fail('media-decode-failed');
   if(settled)return;settled=true;clearTimeout(timer);resolve({stdout,stderr});
  });
 });
}

function jobKey(name,generation) {
  return createHash('sha256').update(BUCKET+'\n'+name+'\n'+generation).digest('hex');
}
function frameTime(duration,random=Math.random) {
  if (!Number.isFinite(duration)||duration<=0) throw new Error('duration-unavailable');
  return Math.max(0,Math.min(duration-.001,duration*(.1+random()*.8)));
}
function parseDuration(text) {
  const match=text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (!match) throw new Error('duration-unavailable');
  return Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
}
function runFFmpeg(args,allowProbeExit=false) {
  return new Promise((resolve,reject) => {
    const child=spawn(ffmpeg,args,{stdio:['ignore','ignore','pipe'],shell:false});
    let stderr='',timedOut=false,settled=false;
    const started=Date.now();
    const timer=setTimeout(() => { timedOut=true; child.kill('SIGKILL'); },95000);
    const fail=(message,code,signal) => {
      if (settled) return; settled=true; clearTimeout(timer);
      const error=new Error(message);
      error.ffmpegCode=code; error.ffmpegSignal=signal || '';
      error.elapsedMs=Date.now()-started;
      error.detail=stderr.replace(/https?:\/\/[^\s]+/g,'<media>').slice(-2000);
      reject(error);
    };
    child.stderr.on('data',data => { stderr=(stderr+data.toString()).slice(-24000); });
    child.once('error',error => fail('ffmpeg-start-failed',error.code || '',null));
    child.once('close',(code,signal) => {
      if (settled) return;
      if (timedOut) return fail('ffmpeg-timeout',code,signal);
      if (signal) return fail('ffmpeg-crashed-'+signal,code,signal);
      if (code!==0 && !(allowProbeExit && code===1)) return fail('video-decode-failed',code,null);
      settled=true; clearTimeout(timer); resolve(stderr);
    });
  });
}
function thumbnailErrorDetails(error) {
  return {reason:error.message || 'unknown',code:error.code || '',stage:error.thumbnailStage || '',
    ffmpegCode:error.ffmpegCode ?? '',signal:error.ffmpegSignal || '',detail:error.detail || ''};
}

// FFmpeg handles only local files or loopback HTTP. GCS HTTPS stays in Node's SDK.
function parseByteRange(value,size) {
  if (!value) return {start:0,end:size-1,partial:false};
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  let start,end;
  if (!match[1]) {
    const suffix=Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix<=0) return null;
    start=Math.max(0,size-suffix); end=size-1;
  } else {
    start=Number(match[1]); end=match[2] ? Math.min(Number(match[2]),size-1) : size-1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<0 || start>=size || end<start) return null;
  return {start,end,partial:true};
}
async function createVideoInput(sourceFile,metadata,directory) {
  const size=Number(metadata.size);
  if (!Number.isSafeInteger(size) || size<=0) throw new Error('video-size-invalid');
  // /tmp uses instance memory. Small files are fully downloaded; large files use range reads.
  if (size<=128*1024*1024) {
    const local=path.join(directory,'source-video');
    await pipeline(sourceFile.createReadStream(),createWriteStream(local),{signal:AbortSignal.timeout(100000)});
    return {source:local,options:['-protocol_whitelist','file'],mode:'local-file',close:async()=>{}};
  }
  const pathname='/media/'+randomUUID();
  const streams=new Set(); let readBytes=0;
  const server=createServer((request,response) => {
    if (request.url!==pathname) { response.writeHead(404); response.end(); return; }
    if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const range=parseByteRange(request.headers.range,size);
    if (!range) { response.writeHead(416,{'Content-Range':'bytes */'+size}); response.end(); return; }
    const headers={'Content-Type':'application/octet-stream','Accept-Ranges':'bytes',
      'Content-Length':range.end-range.start+1,'Connection':'close'};
    if (range.partial) headers['Content-Range']=`bytes ${range.start}-${range.end}/${size}`;
    response.writeHead(range.partial ? 206 : 200,headers);
    if (request.method==='HEAD') { response.end(); return; }
    const stream=sourceFile.createReadStream({start:range.start,end:range.end,validation:false});
    streams.add(stream);
    stream.on('data',chunk=>{readBytes+=chunk.length;if(readBytes>512*1024*1024)stream.destroy(invalidUpload('動画の解析量が上限を超えました。MP4に変換してから投稿してください。'));});
    response.setTimeout(25000,() => response.destroy());
    const dispose=() => { streams.delete(stream); if (!stream.destroyed) stream.destroy(); };
    response.once('close',dispose); request.once('aborted',dispose);
    pipeline(stream,response).catch(() => {}).finally(dispose);
  });
  server.on('clientError',(_error,socket) => socket.destroy());
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  return {source:`http://127.0.0.1:${server.address().port}${pathname}`,
    options:['-protocol_whitelist','http,tcp','-http_proxy','','-rw_timeout','25000000'],mode:'sdk-range',
    close:async() => {
      for (const stream of streams) stream.destroy();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    }};
}

async function claimJob(file) {
  const token=randomUUID(), now=Date.now();
  const body=JSON.stringify({token,startedAt:now});
  try {
    await file.save(body,{resumable:false,contentType:'application/json',preconditionOpts:{ifGenerationMatch:0}});
    return token;
  } catch(error) { if (Number(error.code)!==412) throw error; }
  const [metadata]=await file.getMetadata();
  if (Date.now()-Date.parse(metadata.updated)<12*60*1000) return null;
  try {
    await file.save(body,{resumable:false,contentType:'application/json',preconditionOpts:{ifGenerationMatch:metadata.generation}});
    return token;
  } catch(error) { if (Number(error.code)===412) return null; throw error; }
}
async function releaseJob(file,token) {
  try {
    const [metadata]=await file.getMetadata(); const [body]=await file.download();
    if (JSON.parse(body.toString()).token===token) await file.delete({ifGenerationMatch:metadata.generation});
  } catch(error) { if (Number(error.code)!==404 && Number(error.code)!==412) logger.warn('thumbnail-lock-cleanup',{code:error.code || 'unknown'}); }
}
function usableVideo(name,metadata) {
  return name.startsWith('videos/') && !name.endsWith('/') &&
    (/^video\//.test(metadata.contentType || '') || /\.(mp4|mov|m4v|webm|mkv|avi|ogv)$/i.test(name));
}
async function generateThumbnail(name,expectedGeneration) {
  const bucket=getStorage().bucket(BUCKET), file=bucket.file(name);
  let metadata;
  try { [metadata]=await file.getMetadata(); }
  catch(error) { if (Number(error.code)===404) return 'missing'; throw error; }
  if (!usableVideo(name,metadata) || String(metadata.generation)!==String(expectedGeneration) ||
      String(metadata.metadata?.thumbUrl || '').trim()) return 'skip';
  const id=jobKey(name,metadata.generation);
  const lock=bucket.file('thumbnail-jobs/locks/'+id+'.json');
  const token=await claimJob(lock);
  if (!token) return 'busy';
  let directory,videoInput,stage='prepare';
  try {
    directory=await mkdtemp(path.join(tmpdir(),'submovie-thumbnail-'));
    // Pin the source generation and let the Storage SDK handle HTTPS/authentication.
    stage='download';
    const sourceFile=bucket.file(name,{generation:String(metadata.generation)});
    videoInput=await createVideoInput(sourceFile,metadata,directory);
    logger.info('thumbnail-input',{name,mode:videoInput.mode});
    stage='probe';
    const format=['-format_whitelist','mov,matroska,webm,avi,flv,mpeg,mpegts,ogg,asf'];
    const probe=await runFFmpeg(['-hide_banner','-nostdin','-threads','1',...videoInput.options,...format,'-i',videoInput.source],true);
    const duration=parseDuration(probe), output=path.join(directory,'frame.jpg');
    stage='extract';
    await runFFmpeg(['-hide_banner','-loglevel','error','-nostdin','-threads','1',
      '-ss',String(frameTime(duration)),...videoInput.options,...format,'-i',videoInput.source,
      '-map','0:v:0','-frames:v','1','-an','-sn','-dn',
      '-vf','scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2',
      '-q:v','3','-threads','1','-y',output]);
    stage='save-image';
    const image=await readFile(output);
    if (!image.length || image.length>2*1024*1024) throw new Error('thumbnail-size-invalid');
    const thumbnail=bucket.file('thumbnails/auto-'+id+'.jpg');
    const downloadToken=randomUUID();
    try {
      await thumbnail.save(image,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{
        contentType:'image/jpeg',cacheControl:'public,max-age=31536000,immutable',
        metadata:{uploaderUid:metadata.metadata?.uploaderUid || '',firebaseStorageDownloadTokens:downloadToken,
          autoThumbnailSource:name,autoThumbnailGeneration:String(metadata.generation)}
      }});
    } catch(error) { if (Number(error.code)!==412) throw error; }
    const [thumbMetadata]=await thumbnail.getMetadata();
    const savedToken=thumbMetadata.metadata?.firebaseStorageDownloadTokens?.split(',')[0];
    if (!savedToken) throw new Error('thumbnail-token-missing');
    const url='https://firebasestorage.googleapis.com/v0/b/'+encodeURIComponent(BUCKET)+
      '/o/'+encodeURIComponent(thumbnail.name)+'?alt=media&token='+encodeURIComponent(savedToken);
    stage='update-metadata';
    // Re-read + CAS preserve a concurrently selected thumbnail and HLS/interaction metadata.
    for(let retry=0; retry<4; retry++) {
      const [latest]=await file.getMetadata();
      if (String(latest.generation)!==String(expectedGeneration) || String(latest.metadata?.thumbUrl || '').trim()) return 'skip';
      try {
        await file.setMetadata({metadata:{...latest.metadata,thumbUrl:url}},
          {ifGenerationMatch:latest.generation,ifMetagenerationMatch:latest.metageneration});
        return 'created';
      } catch(error) { if (Number(error.code)!==412) throw error; }
    }
    throw new Error('metadata-busy');
  } catch(error) {
    error.thumbnailStage=stage; throw error;
  } finally {
    if (videoInput) await videoInput.close();
    if (directory) await rm(directory,{recursive:true,force:true});
    await releaseJob(lock,token);
  }
}
exports.submovieAutoThumbnail=onObjectFinalized({...options,bucket:BUCKET,retry:false},async event => {
  const object=event.data;
  if (!object?.name?.startsWith('videos/') || String(object.metadata?.thumbUrl || '').trim()) return;
  try {
    const result=await generateThumbnail(object.name,object.generation);
    logger.info('thumbnail-result',{name:object.name,result});
  } catch(error) {
    // Do not log FFmpeg's headers/arguments; a daily job retries missed files.
    logger.error('thumbnail-failed',{name:object.name,...thumbnailErrorDetails(error)});
  }
});
exports.submovieThumbnailBackfill=onSchedule({...options,schedule:'0 3 * * *',timeZone:'Asia/Tokyo',retryCount:0},async () => {
  const bucket=getStorage().bucket(BUCKET), checkpoint=bucket.file('thumbnail-jobs/backfill.json');
  const lock=bucket.file('thumbnail-jobs/backfill-lock.json'), token=await claimJob(lock);
  if (!token) return;
  try {
    let cursor='';
    try { const [data]=await checkpoint.download(); cursor=JSON.parse(data.toString()).cursor || ''; }
    catch(error) { if (Number(error.code)!==404) throw error; }
    const [files,nextQuery]=await bucket.getFiles({prefix:'videos/',startOffset:cursor || 'videos/',maxResults:100,autoPaginate:false});
    const started=Date.now(); let generated=0, scanned=0, created=0, failed=0, completed=true, last=cursor;
    for (const file of files) {
      if (file.name<=cursor) continue;
      if (generated>=5 || Date.now()-started>330000) { completed=false; break; }
      last=file.name; scanned++;
      try {
        const [metadata]=await file.getMetadata();
        if (!usableVideo(file.name,metadata) || String(metadata.metadata?.thumbUrl || '').trim()) continue;
        generated++; // Include failed decodes in the bounded daily budget.
        const result=await generateThumbnail(file.name,metadata.generation);
        if (result==='created') created++;
        logger.info('thumbnail-backfill-result',{name:file.name,result});
      } catch(error) {
        failed++;
        logger.error('thumbnail-backfill-failed',{name:file.name,...thumbnailErrorDetails(error)});
      }
    }
    const nextCursor=completed && !nextQuery?.pageToken ? '' : last;
    await checkpoint.save(JSON.stringify({cursor:nextCursor,updatedAt:new Date().toISOString()}),{resumable:false,contentType:'application/json'});
    logger.info('thumbnail-backfill',{scanned,attempted:generated,created,failed,more:!!nextCursor});
    if (failed) throw new Error('thumbnail-backfill-failed: '+failed+' video(s). See thumbnail-backfill-failed logs.');
  } finally { await releaseJob(lock,token); }
});
// Internal helpers are not Firebase exports; unit tests load them via a VM fixture.

// Private upload inspection. Only the Admin SDK can publish to videos/.
async function inspectPrivateUpload(name,generation) {
  const bucket=getStorage().bucket(BUCKET),stageFile=bucket.file(name,{generation:String(generation)});
  const [metadata]=await stageFile.getMetadata();
  const ticketId=metadata.metadata?.uploadTicketId;
  if(typeof ticketId!=='string'||!/^[A-Za-z0-9_-]{1,300}$/.test(ticketId)) {
    logger.warn('upload-validation-no-ticket',{name});return 'ignored';
  }
  const database=getFirestore(),ticketRef=database.doc('videoUploadTickets/'+ticketId),lease=randomUUID();
  let ticket;
  const acquired=await database.runTransaction(async tx=>{
    const snapshot=await tx.get(ticketRef);if(!snapshot.exists)return false;
    ticket=snapshot.data();
    if(ticket.status==='ready'||ticket.status==='rejected')return false;
    if(!ticket.active||ticket.policyVersion!==POLICY_VERSION||ticket.objectName!==name||
       ticket.bucket!==BUCKET||metadata.metadata?.uploaderUid!==ticket.uid||
       Number(metadata.size)!==ticket.size||metadata.contentType!==ticket.contentType||
       !name.startsWith('video-uploads/'+ticket.uid+'/')||
       !/^videos\/[A-Za-z0-9-]+_/.test(ticket.publishedObjectName||''))return false;
    const now=Date.now();
    if(ticket.status==='validating'&&Number(ticket.validationLeaseUntil)>now)return 'busy';
    const attempts=Number(ticket.validationAttempts)||0;
    if(attempts>=3){tx.update(ticketRef,{status:'rejected',active:false,rejectionMessage:'動画の検査を完了できませんでした。形式や通信を確認して、もう一度投稿してください。'});return 'exhausted';}
    tx.update(ticketRef,{status:'validating',validationAttempts:attempts+1,validationLease:lease,validationLeaseUntil:now+11*60*1000});
    return true;
  });
  if(acquired==='exhausted'){await stageFile.delete({ifGenerationMatch:String(generation)}).catch(()=>{});return 'rejected';}
  if(acquired==='busy')throw new Error('validation-busy');
  if(!acquired)return 'skip';
  let directory,input;
  const finish=async fields=>database.runTransaction(async tx=>{
    const current=await tx.get(ticketRef);
    if(!current.exists||current.data().validationLease!==lease)return false;
    tx.update(ticketRef,{...fields,validationLease:'',validationLeaseUntil:0});return true;
  });
  try {
    if(!Number.isSafeInteger(ticket.size)||ticket.size<=0||ticket.size>MAX_VIDEO_BYTES)throw invalidUpload('動画は1本256GB以下にしてください。');
    // Copy metadata only after validation; never copy client-supplied download tokens or HLS URLs.
    const raw=metadata.metadata||{};
    const allowed={};for(const key of ['title','desc','category','thumbUrl','mutedCommentWords','danmakuEnabled','commentsEnabled','dislikesEnabled'])if(raw[key]!==undefined)allowed[key]=raw[key];
    const details=cleanDetails(allowed,true);
    await validateThumbnail(bucket,ticket.uid,details.thumbUrl||'');
    directory=await mkdtemp(path.join(tmpdir(),'submovie-inspect-'));
    input=await createVideoInput(stageFile,metadata,directory);
    const format=['-format_whitelist','mov,matroska,webm,avi,flv,mpeg,mpegts,ogg,asf'];
    const probeText=await runMediaTool(ffprobe,['-v','error',...input.options,...format,
      '-probesize','33554432','-analyzeduration','10000000','-show_entries',
      'format=duration,format_name:stream=codec_type,codec_name,width,height,duration:stream_disposition=attached_pic',
      '-of','json',input.source]);
    let probe;try{probe=JSON.parse(probeText.stdout);}catch{throw invalidUpload('動画の形式を確認できませんでした。');}
    const info=validateProbe(probe);
    const preview=path.join(directory,'verified-frame.jpg');
    await runMediaTool(ffmpeg,['-hide_banner','-loglevel','error','-nostdin',...input.options,...format,
      '-probesize','33554432','-analyzeduration','10000000','-threads','1','-i',input.source,
      '-map','0:V:0','-frames:v','1','-an','-sn','-dn',
      '-vf','scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2',
      '-threads','1','-y',preview]);
    const image=await readFile(preview);if(!image.length||image.length>2*1024*1024)throw invalidUpload('動画の映像を確認できませんでした。');
    const profile=await database.doc('users/'+ticket.uid).get();
    const author=String(profile.data()?.channelName||'ユーザー').slice(0,200);
    const finalMetadata={...details,uploaderUid:ticket.uid,uploaderName:author,uploadTicketId:ticketId,
      uploadValidation:'ready',validatedDuration:String(info.duration),validatedPolicyVersion:String(POLICY_VERSION),firebaseStorageDownloadTokens:randomUUID()};
    const current=await ticketRef.get();
    if(!current.exists||!current.data().active||current.data().validationLease!==lease)return 'cancelled';
    const destination=bucket.file(ticket.publishedObjectName);
    try {
      await stageFile.copy(destination,{preconditionOpts:{ifGenerationMatch:0},
        contentType:ticket.contentType,cacheControl:'public,max-age=3600',metadata:finalMetadata
      });
    } catch(error) {
      if(Number(error.code)!==412)throw error;
      const [existing]=await destination.getMetadata();
      if(existing.metadata?.uploadTicketId!==ticketId||existing.metadata?.uploadValidation!=='ready')throw new Error('publication-conflict');
    }
    await finish({status:'ready',durationSeconds:info.duration,publishedAt:FieldValue.serverTimestamp()});
    await database.doc('videoUploadSessions/'+ticketId).delete().catch(()=>{});
    // Generation pinning prevents deletion of any replacement object.
    await stageFile.delete({ifGenerationMatch:String(generation)}).catch(error=>{if(Number(error.code)!==404)logger.warn('upload-stage-cleanup',{code:error.code||''});});
    return 'ready';
  } catch(error) {
    const rejected=!!error.invalidUpload||['media-decode-failed','media-tool-timeout','media-tool-crashed'].includes(error.message);
    if(rejected) {
      await finish({status:'rejected',active:false,rejectionMessage:error.invalidUpload?error.message:'動画を安全に読み取れませんでした。MP4などに変換してから投稿してください。'});
      await database.doc('videoUploadSessions/'+ticketId).delete().catch(()=>{});
      await stageFile.delete({ifGenerationMatch:String(generation)}).catch(()=>{});
      logger.warn('upload-rejected',{name,reason:error.invalidUpload?'policy':error.message});return 'rejected';
    }
    await finish({status:'uploading'});logger.error('upload-inspection-retry',{name,code:error.code||'',reason:error.message||''});throw error;
  } finally {
    if(input)await input.close();
    if(directory)await rm(directory,{recursive:true,force:true});
  }
}
exports.submovieValidateUpload=onObjectFinalized({...options,bucket:BUCKET,retry:true},async event=>{
 const object=event.data;if(!object?.name?.startsWith('video-uploads/'))return;
 await inspectPrivateUpload(object.name,object.generation);
});
