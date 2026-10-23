'use strict';
const {createHash}=require('node:crypto');
const BUCKET='testo-movie-site.firebasestorage.app';
const digest=value=>createHash('sha256').update(value).digest('hex');
function creatorRuntimeSafe(version){const m=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);if(!m)return false;const[,major,minor,patch]=m.map(Number),required={22:[23,4],24:[22,1],26:[12,1]}[major];return !!required&&(minor>required[0]||minor===required[0]&&patch>=required[1]);}
function videoPath(value){return typeof value==='string'&&value.startsWith('videos/')&&value.length>7&&Buffer.byteLength(value)<=1024&&!/[\x00-\x1f\x7f]/.test(value)&&!value.split('/').some(p=>p==='.'||p==='..');}
function plain(value,max,label){if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw Error(label+'を確認してください。');return value.trim();}
function externalUrl(value){if(value==='')return'';const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.href.length>2048||u.hostname==='localhost'||/^(127\.|0\.|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)||u.hostname.includes(':'))throw Error('リンクは公開サイトのHTTPS URLにしてください。');return u.href;}
function imageObject(value){if(value==='')return'';const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='firebasestorage.googleapis.com'||u.port||u.username||u.password||!u.pathname.startsWith('/v0/b/'+BUCKET+'/o/'))throw Error('画像の保存先を確認してください。');const object=decodeURIComponent(u.pathname.slice(('/v0/b/'+BUCKET+'/o/').length));if(!object.startsWith('thumbnails/')||object.split('/').some(x=>x==='.'||x==='..'))throw Error('画像の保存先を確認してください。');return object;}
function channelInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('チャンネル設定を確認してください。');
 const handle=plain(value.handle||'',40,'ハンドル');if(handle&&!/^[\p{L}\p{N}_-]+$/u.test(handle))throw Error('ハンドルには文字・数字・_・-を使用してください。');
 const links=value.links||[];if(!Array.isArray(links)||links.length>5)throw Error('外部リンクは5件までです。');
 for(const key of ['featuredVideo','returningVideo'])if(value[key]&&!videoPath(value[key]))throw Error('紹介する動画を確認してください。');
 const result={schemaVersion:1,handle,bio:plain(value.bio||'',2000,'説明'),bannerUrl:plain(value.bannerUrl||'',4096,'バナー'),watermarkUrl:plain(value.watermarkUrl||'',4096,'透かし'),featuredVideo:value.featuredVideo||'',returningVideo:value.returningVideo||'',links:links.map(x=>({title:plain(x.title,60,'リンク名'),url:externalUrl(plain(x.url,2048,'URL'))}))};
 imageObject(result.bannerUrl);imageObject(result.watermarkUrl);return result;
}
function videoDetailsInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('動画の追加設定を確認してください。');
 const tags=value.tags||[],chapters=value.chapters||[],endScreens=value.endScreens||[];
 if(!Array.isArray(tags)||tags.length>30||!Array.isArray(chapters)||chapters.length>100||!Array.isArray(endScreens)||endScreens.length>4)throw Error('追加設定の件数が上限を超えています。');
 const captions=plain(value.captions||'',64000,'字幕');if(captions&&!/^WEBVTT(?:\s|$)/.test(captions))throw Error('字幕はWEBVTT形式で入力してください。');
 if(captions&&(/<\s*(script|iframe|object|img|style)\b/i.test(captions)||/\b(?:javascript|data):/i.test(captions)))throw Error('字幕に使用できない記述があります。');
 let previous=-1;const normalized=chapters.map(c=>{if(typeof c.time!=='number'||!Number.isFinite(c.time)||c.time<0||c.time>43200||c.time<=previous)throw Error('チャプターの時刻は重複せず、小さい順にしてください。');previous=c.time;return{time:c.time,title:plain(c.title,100,'チャプター名')};});
 for(const id of endScreens)if(!videoPath(id))throw Error('終了画面の動画を確認してください。');
 return{schemaVersion:1,tags:[...new Set(tags.map(x=>plain(x,40,'タグ')).filter(Boolean))],chapters:normalized,captions,endScreens:[...new Set(endScreens)]};
}
function createCreatorLab({db,bucket,FieldValue,FieldPath,HttpsError,now=Date.now}){
 const fail=(code,message)=>{throw new HttpsError(code,message);};
 const subscriberDirectory=require('./subscriber-directory.cjs').createSubscriberDirectory({db,FieldValue,FieldPath,HttpsError,now});
 async function owner(uid,videoId){
  if(!videoPath(videoId))fail('invalid-argument','動画を確認してください。');
  let metadata;try{[metadata]=await bucket.file(videoId).getMetadata();}catch(error){fail(Number(error.code)===404?'not-found':'unavailable','動画を確認できませんでした。');}
  if(metadata.metadata?.uploaderUid!==uid)fail('permission-denied','自分の動画だけ管理できます。');return metadata;
 }
 async function limit(uid,write){
  const ref=db.doc('creatorLabRateLimits/'+digest(uid)),minute=Math.floor(now()/60000);
  await db.runTransaction(async tx=>{const s=await tx.get(ref),old=s.data(),same=old?.minute===minute,reads=same?old.reads||0:0,writes=same?old.writes||0:0;
   if(reads>=60||write&&writes>=20)fail('resource-exhausted','操作が続いています。少し待って再度お試しください。');tx.set(ref,{minute,reads:reads+1,writes:writes+Number(write)});});
 }
 async function ownImage(uid,url){
  let name;try{name=imageObject(url);}catch(error){fail('invalid-argument',error.message);}if(!name)return;
  let metadata;try{[metadata]=await bucket.file(name).getMetadata();}catch{fail('invalid-argument','画像を確認できませんでした。');}
  if(metadata.metadata?.uploaderUid!==uid||!['image/jpeg','image/png','image/webp'].includes(metadata.contentType)||Number(metadata.size)>5*1024*1024)fail('permission-denied','自分が保存したPNG・JPEG・WebP画像を使用してください。');
 }
 async function related(uid,ids){for(const id of new Set(ids.filter(Boolean)))await owner(uid,id);}
 async function privateCall(uid,data){
  if(typeof uid!=='string'||!uid||uid.includes('/'))fail('unauthenticated','ログインしてください。');
  const op=data?.op;if(!['getChannel','saveChannel','getVideoDetails','saveVideoDetails','comments','moderate','analytics','subscriberVisibility','syncSubscriberCard','syncSubscriberCards','recentSubscribers'].includes(op))fail('invalid-argument','操作を確認してください。');
  await limit(uid,['saveChannel','saveVideoDetails','moderate','syncSubscriberCard','syncSubscriberCards'].includes(op)||(op==='subscriberVisibility'&&Object.hasOwn(data,'visible')));
  if(['subscriberVisibility','syncSubscriberCard','syncSubscriberCards','recentSubscribers'].includes(op))return subscriberDirectory.call(uid,data);
  if(op==='getChannel'){const s=await db.doc('creatorLabChannels/'+uid).get();return{ok:true,channel:channelInput(s.data()||{})};}
  if(op==='saveChannel'){
   let next;try{next=channelInput(data.channel);}catch(error){fail('invalid-argument',error.message);}
   await ownImage(uid,next.bannerUrl);await ownImage(uid,next.watermarkUrl);await related(uid,[next.featuredVideo,next.returningVideo]);
   await db.doc('creatorLabChannels/'+uid).set({...next,updatedAt:FieldValue.serverTimestamp()});return{ok:true,channel:next};
  }
  const meta=await owner(uid,data.videoId),key=digest(data.videoId);
  if(op==='getVideoDetails'){const s=await db.doc('creatorLabVideoDetails/'+key).get();return{ok:true,details:videoDetailsInput(s.data()?.ownerUid===uid&&s.data()?.sourceGeneration===String(meta.generation)?s.data():{})};}
  if(op==='saveVideoDetails'){
   let next;try{next=videoDetailsInput(data.details);}catch(error){fail('invalid-argument',error.message);}await related(uid,next.endScreens);
   await db.doc('creatorLabVideoDetails/'+key).set({...next,ownerUid:uid,videoId:data.videoId,sourceGeneration:String(meta.generation),updatedAt:FieldValue.serverTimestamp()});return{ok:true,details:next};
  }
  if(op==='comments'){
   if(data.cursor!==undefined&&data.cursor!==null&&(typeof data.cursor!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(data.cursor)))fail('invalid-argument','ページ位置を確認してください。');
   let q=db.collection('comments').where('videoId','==',data.videoId).orderBy(FieldPath.documentId()).limit(50);if(data.cursor)q=q.startAfter(data.cursor);
   const snapshot=await q.get();return{ok:true,comments:snapshot.docs.map(doc=>{const c=doc.data();return{id:doc.id,type:c.type==='danmaku'?'danmaku':'normal',text:typeof c.text==='string'?c.text.slice(0,2000):'',author:typeof c.author==='string'?c.author.slice(0,200):'ユーザー',authorUid:typeof c.authorUid==='string'?c.authorUid:'',parentId:typeof c.parentId==='string'?c.parentId:'',videoTime:Number.isFinite(c.videoTime)?c.videoTime:0,createdAt:c.createdAt?.toMillis?.()||0,hidden:c.creatorHidden===true,heart:c.creatorHeart===true,pinned:meta.metadata?.pinnedCommentId===doc.id};}),next:snapshot.size===50?snapshot.docs.at(-1).id:null};
  }
  if(op==='moderate'){
   if(typeof data.commentId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(data.commentId)||!['heart','hide','pin'].includes(data.mode)||typeof data.value!=='boolean')fail('invalid-argument','コメントの操作を確認してください。');
   const ref=db.doc('comments/'+data.commentId),snap=await ref.get(),comment=snap.data();if(!snap.exists||comment.videoId!==data.videoId)fail('not-found','コメントが見つかりません。');
   if(data.mode==='pin'){
    if(comment.type!=='normal'||comment.parentId)fail('invalid-argument','通常コメントの親コメントだけ固定できます。');
    const next={...(meta.metadata||{}),pinnedCommentId:data.value?data.commentId:''};
    try{await bucket.file(data.videoId).setMetadata({metadata:next},{ifGenerationMatch:meta.generation,ifMetagenerationMatch:meta.metageneration});}catch{fail('aborted','動画の設定が変わりました。もう一度読み込んでください。');}
   }else await db.runTransaction(async tx=>{const latest=await tx.get(ref);if(!latest.exists||latest.data().videoId!==data.videoId)fail('not-found','コメントが見つかりません。');tx.update(ref,{[data.mode==='heart'?'creatorHeart':'creatorHidden']:data.value,creatorModeratedAt:FieldValue.serverTimestamp()});});
   return{ok:true};
  }
  const days=Number(data.days);if(![7,28,90].includes(days))fail('invalid-argument','集計期間を確認してください。');
  const cache=db.doc('creatorLabAnalyticsCache/'+digest(uid+'\n'+data.videoId+'\n'+days)),cached=await cache.get();if(cached.exists&&now()-(cached.data().at||0)<60000)return{ok:true,...cached.data().result};
  const day=86400000,jst=32400000,start=Math.floor((now()+jst)/day)*day-jst;
  const refs=Array.from({length:days},(_,i)=>db.doc('videoDaily/'+(start-(days-1-i)*day)+'/counts/'+data.videoId.replace(/\//g,'__')));
  const snapshots=await db.getAll(...refs);const series=snapshots.map((s,i)=>({date:new Date(start-(days-1-i)*day+jst).toISOString().slice(0,10),views:Math.max(0,Number(s.data()?.count)||0)}));
  const result={series,periodViews:series.reduce((n,d)=>n+d.views,0),periodDays:days};await cache.set({at:now(),result});return{ok:true,...result};
 }
 async function publicCall(data){
  if(data?.kind==='channel'){
   if(typeof data.uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(data.uid))fail('invalid-argument','チャンネルを確認してください。');
   const snap=await db.doc('creatorLabChannels/'+data.uid).get();let channel;try{channel=channelInput(snap.data()||{});}catch{channel=channelInput({});}return{ok:true,channel};
  }
  if(data?.kind==='video'&&videoPath(data.videoId)){
   let meta;try{[meta]=await bucket.file(data.videoId).getMetadata();}catch{fail('not-found','動画が見つかりません。');}
   const id=meta.metadata?.uploaderUid;if(!id||!/^[A-Za-z0-9_-]{1,128}$/.test(id))return{ok:true,details:videoDetailsInput({}),channel:channelInput({})};
   const[snap,c]=await Promise.all([db.doc('creatorLabVideoDetails/'+digest(data.videoId)).get(),db.doc('creatorLabChannels/'+id).get()]);
   let details,channel;try{details=videoDetailsInput(snap.data()?.ownerUid===id&&snap.data()?.sourceGeneration===String(meta.generation)?snap.data():{});}catch{details=videoDetailsInput({});}try{channel=channelInput(c.data()||{});}catch{channel=channelInput({});}
   return{ok:true,details,channel};
  }
  fail('invalid-argument','公開情報の種類を確認してください。');
 }
 return{privateCall,publicCall};
}
module.exports={createCreatorLab,creatorRuntimeSafe,videoPath,channelInput,videoDetailsInput,externalUrl,imageObject};
