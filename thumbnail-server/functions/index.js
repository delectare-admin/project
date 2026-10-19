'use strict';
// Independent codebase: does not replace anti-spam or notification functions.
const {initializeApp,getApp}=require('firebase-admin/app');
const {getStorage}=require('firebase-admin/storage');
const {onObjectFinalized}=require('firebase-functions/v2/storage');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const logger=require('firebase-functions/logger');
const {spawn}=require('node:child_process');
const {mkdtemp,rm,readFile}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
initializeApp();
const BUCKET='testo-movie-site.firebasestorage.app';
const REGION='asia-northeast1';
const options={region:REGION,memory:'1GiB',cpu:1,timeoutSeconds:540,
  minInstances:0,maxInstances:1,concurrency:1};
const ffmpeg=require('ffmpeg-static');
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
    let stderr='';
    const timeout=setTimeout(() => child.kill('SIGKILL'),95000);
    child.stderr.on('data',data => { stderr=(stderr+data.toString()).slice(-24000); });
    child.once('error',() => { clearTimeout(timeout); reject(new Error('ffmpeg-start-failed')); });
    child.once('close',(code,signal) => {
      clearTimeout(timeout);
      if (!signal && (code===0 || (allowProbeExit && code===1))) resolve(stderr);
      else reject(new Error(signal ? 'ffmpeg-timeout' : 'video-decode-failed'));
    });
  });
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
  let directory;
  try {
    directory=await mkdtemp(path.join(tmpdir(),'submovie-thumbnail-'));
    // Authenticated HTTPS range reads: no signed URL permissions or whole-video /tmp copy.
    const credential=await getApp().options.credential.getAccessToken();
    const source='https://storage.googleapis.com/download/storage/v1/b/'+encodeURIComponent(BUCKET)+
      '/o/'+encodeURIComponent(name)+'?alt=media&generation='+encodeURIComponent(metadata.generation);
    const input=['-protocol_whitelist','https,tls,tcp',
      '-format_whitelist','mov,matroska,webm,avi,flv,mpeg,mpegts,ogg,asf',
      '-rw_timeout','20000000','-headers','Authorization: Bearer '+credential.access_token+'\r\n'];
    const probe=await runFFmpeg(['-hide_banner','-nostdin',...input,'-i',source],true);
    const duration=parseDuration(probe), output=path.join(directory,'frame.jpg');
    await runFFmpeg(['-hide_banner','-loglevel','error','-nostdin','-threads','1',
      '-ss',String(frameTime(duration)),...input,'-i',source,
      '-map','0:v:0','-frames:v','1','-an','-sn','-dn',
      '-vf','scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2',
      '-q:v','3','-threads','1','-y',output]);
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
  } finally {
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
    logger.error('thumbnail-failed',{name:object.name,reason:error.message,code:error.code || ''});
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
    const started=Date.now(); let generated=0, scanned=0, completed=true, last=cursor;
    for (const file of files) {
      if (file.name<=cursor) continue;
      if (generated>=5 || Date.now()-started>330000) { completed=false; break; }
      last=file.name; scanned++;
      try {
        const [metadata]=await file.getMetadata();
        if (!usableVideo(file.name,metadata) || String(metadata.metadata?.thumbUrl || '').trim()) continue;
        generated++; // Include failed decodes in the bounded daily budget.
        await generateThumbnail(file.name,metadata.generation);
      } catch(error) { logger.warn('thumbnail-backfill-skipped',{name:file.name,reason:error.message,code:error.code || ''}); }
    }
    const nextCursor=completed && !nextQuery?.pageToken ? '' : last;
    await checkpoint.save(JSON.stringify({cursor:nextCursor,updatedAt:new Date().toISOString()}),{resumable:false,contentType:'application/json'});
    logger.info('thumbnail-backfill',{scanned,attempted:generated,more:!!nextCursor});
  } finally { await releaseJob(lock,token); }
});
// Internal helpers are not Firebase exports; unit tests load them via a VM fixture.
