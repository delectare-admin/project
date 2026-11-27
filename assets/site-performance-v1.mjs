// Small, dependency-free helpers. No authentication or security checks are bypassed.
export const PAGE_SIZE=24;
export function validVideoPath(value){return typeof value==='string'&&value.startsWith('videos/')&&value.length>7&&new TextEncoder().encode(value).length<=1500&&!/[\u0000-\u001f\u007f]/.test(value)&&!value.split('/').some(p=>p==='.'||p==='..');}
export function trustedMediaUrl(value,bucket,prefix='hls/'){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname==='firebasestorage.googleapis.com'&&u.pathname.startsWith('/v0/b/'+bucket+'/o/')&&decodeURIComponent(u.pathname.split('/o/')[1]||'').startsWith(prefix)?u.href:'';}catch{return '';}
}
export function orderedVideos(values){return [...values].sort((a,b)=>(Date.parse(b.uploadedAt)||0)-(Date.parse(a.uploadedAt)||0)||a.itemRef.fullPath.localeCompare(b.itemRef.fullPath));}
export class VideoPager{
 constructor(adapter){this.adapter=adapter;this.entries=new Map();this.mode='';this.cursor=null;this.done=false;this.pending=null;this.pages=0;}
 page(){
  if(this.pending)return this.pending;
  if(this.done)return Promise.resolve(this.values());
  this.pending=this.readPage().finally(()=>{this.pending=null;});return this.pending;
 }
 async readPage(){
  if(!this.mode){try{this.mode=await this.adapter.ready()?'catalog':'storage';}catch{this.mode='storage';}}
  let result;
  try{result=await this.adapter[this.mode](this.cursor,PAGE_SIZE);}
  catch(error){if(this.mode!=='catalog')throw error;this.mode='storage';this.cursor=null;this.pages=0;result=await this.adapter.storage(null,PAGE_SIZE);}
  for(const item of result.items||[])if(item?.itemRef&&validVideoPath(item.itemRef.fullPath))this.entries.set(item.itemRef.fullPath,item);
  const previous=this.cursor;this.cursor=result.cursor||null;this.done=!this.cursor;
  if(this.cursor&&this.cursor===previous)throw Error('一覧のページ位置が更新されませんでした。');
  this.pages++;return this.values();
 }
 values(){return orderedVideos(this.entries.values());}
 async all(onPage=()=>{}){while(!this.done){await this.page();onPage(this.values());}return this.values();}
}
export function windowForDanmaku(time){const bucket=Math.floor(Math.max(0,Number(time)||0)/30);return {key:bucket,start:Math.max(0,bucket*30-5),end:bucket*30+60};}
const scripts=new Map();
export function loadVerifiedScript(document,url,integrity,name){
 if(document.defaultView[name])return Promise.resolve(document.defaultView[name]);
 if(scripts.has(url))return scripts.get(url);
 const promise=new Promise((resolve,reject)=>{
  const node=document.createElement('script');node.src=url;node.integrity=integrity;node.crossOrigin='anonymous';node.async=true;
  const timeout=setTimeout(()=>{node.remove();scripts.delete(url);reject(Error('ライブラリの読み込みがタイムアウトしました。'));},15000);
  node.onload=()=>{clearTimeout(timeout);const api=document.defaultView[name];if(api)resolve(api);else{scripts.delete(url);reject(Error('ライブラリを確認できませんでした。'));}};
  node.onerror=()=>{clearTimeout(timeout);node.remove();scripts.delete(url);reject(Error('ライブラリの読み込みに失敗しました。'));};document.head.appendChild(node);
 });scripts.set(url,promise);return promise;
}

export function startupBandwidthProfile({compact=false,connection=null}={}){
 const saveData=Boolean(connection?.saveData);
 const effectiveType=String(connection?.effectiveType||'');
 const slow=saveData||effectiveType==='slow-2g'||effectiveType==='2g';
 const constrained=slow||effectiveType==='3g';
 // Match ABR startup to fast low-to-medium variants (240p-360p) while respecting existing caps.
 const estimate=saveData?280000:(compact||constrained?450000:850000);
 const heightLimit=compact||saveData?360:720;
 return {saveData,slow,constrained,estimate,heightLimit,bandWidthFactor:0.9};
}

export function parseMasterVariants(manifestText,bucket){
 if(typeof manifestText!=='string'||!manifestText.includes('#EXTM3U'))return [];
 const lines=manifestText.split(/\r?\n/),variants=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();
  if(!line.startsWith('#EXT-X-STREAM-INF:'))continue;
  const bwMatch=/BANDWIDTH=(\d+)/i.exec(line);
  const resMatch=/RESOLUTION=\d+x(\d+)/i.exec(line);
  let next='';
  for(let j=i+1;j<lines.length;j++){const candidate=lines[j].trim();if(!candidate)continue;if(candidate.startsWith('#'))continue;next=candidate;i=j;break;}
  const url=trustedMediaUrl(next,bucket,'hls/');
  if(!url)continue;
  variants.push({bandwidth:bwMatch?Number(bwMatch[1]):0,height:resMatch?Number(resMatch[1]):0,url});
 }
 return variants.sort((a,b)=>(a.bandwidth||0)-(b.bandwidth||0)||(a.height||0)-(b.height||0));
}

export function pickStartupVariant(variants,{heightLimit=720,estimate=850000,bandWidthFactor=0.9}={}){
 if(!Array.isArray(variants)||!variants.length)return null;
 const eligible=variants.filter(v=>!v.height||v.height<=heightLimit);
 const pool=eligible.length?eligible:[variants[0]];
 const budget=estimate*bandWidthFactor;
 let chosen=pool[0];
 for(const v of pool){if(v.bandwidth>0&&v.bandwidth<=budget)chosen=v;}
 return chosen;
}

export function firstSegmentUrl(variantText,bucket){
 if(typeof variantText!=='string'||!variantText.includes('#EXTM3U'))return '';
 for(const raw of variantText.split(/\r?\n/)){
  const line=raw.trim();
  if(!line||line.startsWith('#'))continue;
  const url=trustedMediaUrl(line,bucket,'hls/');
  if(url)return url;
 }
 return '';
}

export function createPlaybackPrefetcher({
 bucket,
 loadHls=()=>Promise.resolve(null),
 getDownloadUrl=null,
 isNativeHls=()=>false,
 getProfile=()=>startupBandwidthProfile(),
 maxPlaylists=24,
 playlistTtlMs=5*60*1000,
 segmentTtlMs=15000,
 maxSegmentBytes=2*1024*1024
}){
 const playlistCache=new Map();
 const playlistInFlight=new Map();
 const videoTouched=new Map();
 const urlInFlight=new Map();
 let active=null;
 let hoverTimer=0;
 let pendingSegment=null;

 function clearPendingSegment(keepUrl=''){
  if(!pendingSegment)return;
  if(keepUrl&&pendingSegment.url===keepUrl)return;
  if(pendingSegment.timer)clearTimeout(pendingSegment.timer);
  try{pendingSegment.controller?.abort();}catch{/* ignore */}
  pendingSegment=null;
 }

 function readCachedPlaylist(url){
  const hit=playlistCache.get(url);
  if(!hit)return null;
  if(Date.now()-hit.at>playlistTtlMs){playlistCache.delete(url);return null;}
  // Refresh LRU order.
  playlistCache.delete(url);
  playlistCache.set(url,hit);
  return hit;
 }

 function writeCachedPlaylist(url,text){
  const bytes=new TextEncoder().encode(text).length;
  if(playlistCache.has(url))playlistCache.delete(url);
  playlistCache.set(url,{text,bytes,at:Date.now()});
  while(playlistCache.size>maxPlaylists)playlistCache.delete(playlistCache.keys().next().value);
  return playlistCache.get(url);
 }

 function fetchPlaylist(url,signal){
  const safe=trustedMediaUrl(url,bucket,'hls/');
  if(!safe)return Promise.resolve(null);
  const cached=readCachedPlaylist(safe);
  if(cached)return Promise.resolve(cached);
  if(playlistInFlight.has(safe))return playlistInFlight.get(safe);
  const promise=(async()=>{
   try{
    const res=await fetch(safe,{mode:'cors',credentials:'omit',signal});
    if(!res.ok)return null;
    const text=await res.text();
    if(!text||!text.includes('#EXTM3U')||text.length>512*1024)return null;
    return writeCachedPlaylist(safe,text);
   }catch{return null;}
   finally{if(playlistInFlight.get(safe)===promise)playlistInFlight.delete(safe);}
  })();
  playlistInFlight.set(safe,promise);
  return promise;
 }

 function prefetchSegment(url,videoId){
  const safe=trustedMediaUrl(url,bucket,'hls/');
  if(!safe)return;
  if(pendingSegment&&pendingSegment.url===safe&&Date.now()-pendingSegment.at<segmentTtlMs)return;
  clearPendingSegment();
  const controller=new AbortController();
  const started=performance.now();
  const slot={url:safe,videoId,at:Date.now(),controller,timer:0,promise:null};
  slot.timer=setTimeout(()=>{if(pendingSegment===slot)clearPendingSegment();},segmentTtlMs);
  slot.promise=(async()=>{
   try{
    const res=await fetch(safe,{mode:'cors',credentials:'omit',signal:controller.signal});
    if(!res.ok)return null;
    const len=Number(res.headers.get('content-length'));
    if(Number.isFinite(len)&&len>maxSegmentBytes){controller.abort();return null;}
    const buffer=await res.arrayBuffer();
    if(!buffer||buffer.byteLength===0||buffer.byteLength>maxSegmentBytes)return null;
    const elapsedMs=Math.max(1,performance.now()-started);
    return {buffer,bytes:buffer.byteLength,elapsedMs};
   }catch{return null;}
  })();
  slot.promise.then(entry=>{if(!entry&&pendingSegment===slot)clearPendingSegment();});
  pendingSegment=slot;
 }

 function cancel(keepVideoId=''){
  if(hoverTimer){clearTimeout(hoverTimer);hoverTimer=0;}
  if(active&&active.videoId!==keepVideoId){
   try{active.controller.abort();}catch{/* ignore */}
   active=null;
  }
  if(!keepVideoId||(pendingSegment&&pendingSegment.videoId!==keepVideoId)){
   clearPendingSegment();
  }
 }

 function prefetch(videoData,{eager=false}={}){
  const videoId=videoData?.itemRef?.fullPath;
  if(!videoId||!validVideoPath(videoId))return;
  const profile=getProfile();
  if(!eager&&profile.slow)return;

  const hlsUrl=trustedMediaUrl(videoData.hlsUrl||'',bucket,'hls/');
  if(hlsUrl&&!isNativeHls()){
   void loadHls().catch(()=>{});
  }

  const lastAt=videoTouched.get(videoId)||0;
  const alreadyFresh=Date.now()-lastAt<playlistTtlMs;
  if(active&&active.videoId===videoId&&(!eager||active.eager))return;
  if(alreadyFresh&&!eager)return;

  if(active&&active.videoId!==videoId){
   try{active.controller.abort();}catch{/* ignore */}
   active=null;
  }

  const controller=new AbortController();
  const job={videoId,eager,controller};
  active=job;
  videoTouched.set(videoId,Date.now());
  if(videoTouched.size>64)videoTouched.delete(videoTouched.keys().next().value);

  if(hlsUrl){
   void (async()=>{
    try{
     const master=await fetchPlaylist(hlsUrl,controller.signal);
     if(!master||controller.signal.aborted||active!==job)return;
     const variants=parseMasterVariants(master.text,bucket);
     const chosen=pickStartupVariant(variants,profile);
     if(!chosen)return;
     const variant=await fetchPlaylist(chosen.url,controller.signal);
     if(!variant||controller.signal.aborted||active!==job)return;
     if(eager&&!profile.slow&&!isNativeHls()){
      const seg=firstSegmentUrl(variant.text,bucket);
      if(seg)prefetchSegment(seg,videoId);
     }
    }finally{
     if(active===job)active=null;
    }
   })();
  }else if(eager&&getDownloadUrl&&!videoData.url&&!urlInFlight.has(videoId)){
   const req=Promise.resolve().then(()=>getDownloadUrl(videoData)).then(url=>{
    if(typeof url==='string'&&url)videoData.url=url;
    return url;
   },()=>null).finally(()=>{
    if(urlInFlight.get(videoId)===req)urlInFlight.delete(videoId);
    if(active===job)active=null;
   });
   urlInFlight.set(videoId,req);
  }else if(active===job){
   active=null;
  }
 }

 function scheduleHover(videoData,delayMs=150){
  if(hoverTimer){clearTimeout(hoverTimer);hoverTimer=0;}
  const videoId=videoData?.itemRef?.fullPath;
  if(!videoId||!validVideoPath(videoId))return;
  const profile=getProfile();
  if(profile.slow)return;
  hoverTimer=setTimeout(()=>{hoverTimer=0;prefetch(videoData,{eager:false});},delayMs);
 }

 function cancelHover(){
  if(hoverTimer){clearTimeout(hoverTimer);hoverTimer=0;}
 }

 function matchPlaylist(url){
  const safe=trustedMediaUrl(url,bucket,'hls/');
  if(!safe)return null;
  const cached=readCachedPlaylist(safe);
  if(cached)return cached;
  if(playlistInFlight.has(safe))return playlistInFlight.get(safe);
  return null;
 }

 function takeSegment(url){
  const safe=trustedMediaUrl(url,bucket,'hls/');
  if(!safe||!pendingSegment||pendingSegment.url!==safe)return null;
  if(Date.now()-pendingSegment.at>segmentTtlMs){clearPendingSegment();return null;}
  const slot=pendingSegment;
  if(slot.timer)clearTimeout(slot.timer);
  pendingSegment=null;
  return slot.promise;
 }

 function createHlsLoaders(BaseLoader,{onPlaylistHit,onFragmentHit}={}){
  if(typeof BaseLoader!=='function')return {};
  class PrefetchPlaylistLoader extends BaseLoader{
   constructor(cfg){super(cfg);this._cancelled=false;}
   abort(){this._cancelled=true;super.abort();}
   destroy(){this._cancelled=true;super.destroy();}
   load(context,cfg,callbacks){
    this._cancelled=false;
    const hit=context&&context.url?matchPlaylist(context.url):null;
    if(!hit){super.load(context,cfg,callbacks);return;}
    this.context=context;this.config=cfg;this.callbacks=callbacks;
    Promise.resolve(hit).then(entry=>{
     if(this._cancelled)return;
     if(!entry||typeof entry.text!=='string'){super.load(context,cfg,callbacks);return;}
     const now=performance.now();
     const bytes=entry.bytes||entry.text.length;
     if(this.stats){
      this.stats.aborted=false;
      this.stats.loaded=bytes;
      this.stats.total=bytes;
      if(this.stats.loading){this.stats.loading.start=now;this.stats.loading.first=now;this.stats.loading.end=now;}
     }
     onPlaylistHit?.(context.url,context.type||'');
     callbacks.onSuccess({url:context.url,data:entry.text},this.stats,context,null);
    },()=>{if(!this._cancelled)super.load(context,cfg,callbacks);});
   }
  }
  class PrefetchFragmentLoader extends BaseLoader{
   constructor(cfg){super(cfg);this._cancelled=false;}
   abort(){this._cancelled=true;super.abort();}
   destroy(){this._cancelled=true;super.destroy();}
   load(context,cfg,callbacks){
    this._cancelled=false;
    const canUse=context&&context.url&&context.responseType==='arraybuffer'&&!Number.isFinite(context.rangeStart)&&!Number.isFinite(context.rangeEnd);
    const hit=canUse?takeSegment(context.url):null;
    if(!hit){super.load(context,cfg,callbacks);return;}
    this.context=context;this.config=cfg;this.callbacks=callbacks;
    Promise.resolve(hit).then(entry=>{
     if(this._cancelled)return;
     if(!entry||!(entry.buffer instanceof ArrayBuffer)){super.load(context,cfg,callbacks);return;}
     const now=performance.now();
     const elapsed=Math.max(1,Number(entry.elapsedMs)||1);
     if(this.stats){
      this.stats.aborted=false;
      this.stats.loaded=entry.bytes;
      this.stats.total=entry.bytes;
      if(this.stats.loading){this.stats.loading.start=Math.max(0,now-elapsed);this.stats.loading.first=Math.max(0,now-elapsed*0.5);this.stats.loading.end=now;}
     }
     onFragmentHit?.(context.url,entry.bytes);
     callbacks.onSuccess({url:context.url,data:entry.buffer},this.stats,context,null);
    },()=>{if(!this._cancelled)super.load(context,cfg,callbacks);});
   }
  }
  return {pLoader:PrefetchPlaylistLoader,fLoader:PrefetchFragmentLoader};
 }

 return {prefetch,scheduleHover,cancelHover,cancel,matchPlaylist,takeSegment,createHlsLoaders};
}

export function createTtffTracker(win=globalThis){
 let current=null;
 const round=ms=>Math.round(ms*10)/10;
 function debugEnabled(){
  try{
   if(win.__SUBMOVIE_TTFF_DEBUG===true)return true;
   if(win.location&&new URLSearchParams(win.location.search).get('ttffDebug')==='1')return true;
   return win.localStorage?.getItem('submovie_ttff_debug')==='1';
  }catch{return false;}
 }
 function start({generation,videoId,source='click',hlsPreloaded=false,t0=performance.now()}){
  current={
   generation,videoId,source,t0,finished:false,mode:'',
   prefetch:{hlsPreloaded:Boolean(hlsPreloaded),manifestHit:false,levelHit:false,fragHit:false},
   marks:{},details:{}
  };
  return current;
 }
 function active(generation){return current&&current.generation===generation?current:null;}
 function mark(generation,name,extra=null){
  const run=active(generation);if(!run||run.finished)return;
  if(run.marks[name]===undefined)run.marks[name]=round(performance.now()-run.t0);
  if(extra&&typeof extra==='object')Object.assign(run.details,extra);
 }
 function notePrefetch(generation,key){
  const run=active(generation);if(!run)return;
  run.prefetch[key]=true;
 }
 function setMode(generation,mode){
  const run=active(generation);if(!run)return;
  run.mode=mode;
 }
 function finish(generation){
  const run=active(generation);if(!run||run.finished)return null;
  run.finished=true;
  run.marks.playingMs=round(performance.now()-run.t0);
  const report={
   videoId:run.videoId,source:run.source,mode:run.mode||'unknown',
   ttffMs:run.marks.playingMs,
   ...run.marks,
   prefetch:{...run.prefetch},
   ...run.details
  };
  try{win.__submovieLastTtff=report;}catch{/* ignore */}
  if(debugEnabled()){
   console.info(`[TTFF] ${report.ttffMs}ms (${report.mode})`,report);
  }
  return report;
 }
 function cancel(generation){
  if(current&&(generation===undefined||current.generation===generation))current=null;
 }
 return {start,mark,notePrefetch,setMode,finish,cancel};
}
