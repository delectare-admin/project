'use strict';
const {VERSION,statsKey,ratingKey,requestKey,count}=require('./rating-model.cjs');
function createRatingService({db,bucket,FieldValue,Timestamp,HttpsError}){
 return async function vote(uid,data){
  if(!['video','comment'].includes(data.targetType)||![null,'like','dislike'].includes(data.value)||typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(data.requestId))throw new HttpsError('invalid-argument','評価の操作を確認してください。');
  const kind=data.targetType;
  let videoId=data.videoId,targetId,reference;
  if(kind==='video'){
   if(typeof videoId!=='string'||!videoId.startsWith('videos/')||videoId.length>1024||/[\u0000-\u001f\u007f]/.test(videoId)||Buffer.byteLength(statsKey(videoId))>1500)throw new HttpsError('invalid-argument','動画を確認してください。');
   targetId=statsKey(videoId);reference=db.doc('videoStats/'+targetId);
  }else{
   if(typeof data.commentId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(data.commentId))throw new HttpsError('invalid-argument','コメントを確認してください。');
   targetId=data.commentId;reference=db.doc('comments/'+targetId);
   const comment=await reference.get();if(!comment.exists||comment.data().type!=='normal')throw new HttpsError('not-found','コメントが削除されています。');
   videoId=comment.data().videoId;
  }
  if(typeof videoId!=='string'||!videoId.startsWith('videos/')||Buffer.byteLength(statsKey(videoId))>1500)throw new HttpsError('invalid-argument','動画を確認してください。');
  let metadata;try{[metadata]=await bucket.file(videoId).getMetadata();}catch(error){throw new HttpsError(Number(error.code)===404?'not-found':'unavailable','動画を確認できませんでした。');}
  if(kind==='video'&&data.value==='dislike'&&metadata.metadata?.dislikesEnabled==='false')throw new HttpsError('failed-precondition','投稿者が低評価をオフにしています。');
  const key=ratingKey(kind,targetId),privateRef=db.doc('userRatings/'+uid+'/items/'+key),requestRef=db.doc('ratingRequests/'+requestKey(uid,data.requestId));
  return db.runTransaction(async tx=>{
   const [publicSnap,privateSnap,requestSnap]=await Promise.all([tx.get(reference),tx.get(privateRef),tx.get(requestRef)]);
   if(kind==='comment'&&(!publicSnap.exists||publicSnap.data().type!=='normal'||publicSnap.data().videoId!==videoId))throw new HttpsError('not-found','コメントが削除されています。');
   const current=publicSnap.exists?publicSnap.data():{views:0,likes:0,dislikes:0,ratingSchemaVersion:VERSION,ratingRevision:0};
   if(current.ratingSchemaVersion!==VERSION||Object.hasOwn(current,'likedUsers')||Object.hasOwn(current,'dislikedUsers'))throw new HttpsError('failed-precondition','評価データの移行中です。少し待ってから再度お試しください。');
   const old=privateSnap.exists?privateSnap.data().value:null;
   if(![null,'like','dislike'].includes(old))throw new HttpsError('failed-precondition','自分の評価データを確認できませんでした。');
   let likes,dislikes,revision;try{likes=count(current.likes);dislikes=count(current.dislikes);revision=count(current.ratingRevision);}catch{throw new HttpsError('failed-precondition','評価数を確認できませんでした。');}
   if(requestSnap.exists){const stored=requestSnap.data();if(stored.uid!==uid||stored.key!==key||stored.value!==data.value)throw new HttpsError('invalid-argument','評価リクエストが一致しません。');return{ok:true,key,value:old,likes,dislikes,ratingRevision:revision,replayed:true};}
   if(old!==data.value){
    likes+=Number(data.value==='like')-Number(old==='like');dislikes+=Number(data.value==='dislike')-Number(old==='dislike');
    if(likes<0||dislikes<0||!Number.isSafeInteger(likes)||!Number.isSafeInteger(dislikes)||!Number.isSafeInteger(revision+1))throw new HttpsError('failed-precondition','評価データの整合性を確認してください。');
    revision++;
    const fields={likes,dislikes,ratingSchemaVersion:VERSION,ratingRevision:revision};
    if(publicSnap.exists)tx.update(reference,fields);else tx.create(reference,{views:0,...fields});
    if(data.value===null){if(privateSnap.exists)tx.delete(privateRef);}else tx.set(privateRef,{kind,targetId,videoKey:statsKey(videoId),value:data.value,updatedAt:FieldValue.serverTimestamp()});
   }
   tx.create(requestRef,{uid,key,value:data.value,createdAt:FieldValue.serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+7*86400000)});
   return{ok:true,key,value:data.value,likes,dislikes,ratingRevision:revision};
  });
 };
}
module.exports={createRatingService};
