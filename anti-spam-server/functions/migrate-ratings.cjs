'use strict';
// Administrator-only migration. No credentials or voter IDs are printed.
const {randomUUID,createHash}=require('node:crypto');
const {VERSION,statsKey,ratingKey,legacyVotes,publicRatingData}=require('./rating-model.cjs');
function fingerprint(data){return createHash('sha256').update(JSON.stringify([data.likedUsers??null,data.dislikedUsers??null,data.likes??null,data.dislikes??null])).digest('hex');}
async function migrateOne({db,FieldValue,kind,id,data,apply=false,lockRef,lockToken}){
 const source=db.doc((kind==='video'?'videoStats/':'comments/')+id);
 const hasLegacy=Object.hasOwn(data,'likedUsers')||Object.hasOwn(data,'dislikedUsers');
 if(!hasLegacy&&data.ratingSchemaVersion===VERSION)return{skipped:true,votes:0};
 if(kind==='comment'&&data.type!=='normal'&&!hasLegacy)return{skipped:true,votes:0};
 const votes=legacyVotes(data),key=ratingKey(kind,id);
 const videoKey=kind==='video'?id:typeof data.videoId==='string'?statsKey(data.videoId):null;
 if(videoKey===null)throw new Error('コメントの動画IDが不正です。変更せず停止します。');
 if(!apply)return{skipped:false,votes:votes.length};
 const digest=fingerprint(data),backupRef=db.doc('ratingMigrationBackups/'+key);
 async function ownsLock(tx){if(!lockRef)return;const snap=await tx.get(lockRef);if(snap.data()?.token!==lockToken)throw new Error('別の移行処理が開始されたため停止しました。');}
 await db.runTransaction(async tx=>{
  await ownsLock(tx);const [current,backup]=await Promise.all([tx.get(source),tx.get(backupRef)]);
  if(!current.exists||fingerprint(current.data())!==digest)throw new Error('評価データが変更されたため停止しました。再確認してください。');
  if(backup.exists&&backup.data().fingerprint!==digest)throw new Error('保存済みの評価バックアップと一致しません。自動では上書きしません。');
  if(!backup.exists)tx.create(backupRef,{kind,targetId:id,fingerprint:digest,original:{likes:data.likes??null,dislikes:data.dislikes??null,likedUsers:data.likedUsers??[],dislikedUsers:data.dislikedUsers??[]},createdAt:FieldValue.serverTimestamp()});
 });
 for(let start=0;start<votes.length;start+=150){
  const page=votes.slice(start,start+150),refs=page.map(v=>db.doc('userRatings/'+v.uid+'/items/'+key));
  await db.runTransaction(async tx=>{
   await ownsLock(tx);const snapshots=await Promise.all(refs.map(r=>tx.get(r)));
   snapshots.forEach((snap,i)=>{const vote=page[i];if(snap.exists){const saved=snap.data();if(saved.kind!==kind||saved.targetId!==id||saved.value!==vote.value||saved.videoKey!==videoKey)throw new Error('移行先に異なる評価が存在します。上書きせず停止しました。');}
    else tx.create(refs[i],{kind,targetId:id,videoKey,value:vote.value,updatedAt:FieldValue.serverTimestamp(),migrated:true});});
   if(lockRef)tx.update(lockRef,{leaseUntilMs:Date.now()+30*60000});
  });
 }
 await db.runTransaction(async tx=>{
  await ownsLock(tx);const current=await tx.get(source);
  if(!current.exists||fingerprint(current.data())!==digest)throw new Error('評価データが変更されたため、公開データの除去を中止しました。');
  // Keep current text, timestamps, view counts and all unrelated feature fields.
  const latest=publicRatingData(current.data());tx.set(source,latest);
  tx.update(backupRef,{completedAt:FieldValue.serverTimestamp()});if(lockRef)tx.update(lockRef,{leaseUntilMs:Date.now()+30*60000});
 });
 return{skipped:false,votes:votes.length};
}
async function migrateAll({db,FieldValue,FieldPath,apply=false,log=console.log}){
 const lockRef=db.doc('securityMigrations/ratingPrivacyV2'),token=randomUUID();
 if(apply)await db.runTransaction(async tx=>{const old=await tx.get(lockRef);if(old.data()?.status==='running'&&Number(old.data().leaseUntilMs)>Date.now())throw new Error('移行処理が実行中です。終了を待ってください。');tx.set(lockRef,{status:'running',token,leaseUntilMs:Date.now()+30*60000,startedAt:FieldValue.serverTimestamp()});});
 let documents=0,votes=0,skipped=0;
 try{
  for(const[kind,collectionName]of[['video','videoStats'],['comment','comments']]){
   let cursor;
   for(;;){let q=db.collection(collectionName).orderBy(FieldPath.documentId()).limit(200);if(cursor)q=q.startAfter(cursor);const snapshot=await q.get();if(snapshot.empty)break;
    for(const row of snapshot.docs){const result=await migrateOne({db,FieldValue,kind,id:row.id,data:row.data(),apply,lockRef:apply?lockRef:undefined,lockToken:token});documents++;votes+=result.votes;skipped+=Number(result.skipped);}
    cursor=snapshot.docs.at(-1);log('確認済み '+documents+'件 / 評価 '+votes+'件');
   }
  }
  if(apply)await db.runTransaction(async tx=>{const s=await tx.get(lockRef);if(s.data()?.token!==token)throw new Error('移行状態が変更されました。');tx.update(lockRef,{status:'done',leaseUntilMs:0,completedAt:FieldValue.serverTimestamp(),documents,votes});});
  return{documents,votes,skipped,applied:apply};
 }catch(error){if(apply)await db.runTransaction(async tx=>{const s=await tx.get(lockRef);if(s.data()?.token===token)tx.update(lockRef,{status:'paused',leaseUntilMs:0});}).catch(()=>{});throw error;}
}
if(require.main===module){(async()=>{
 const args=process.argv.slice(2);if(args.length!==1||!['--dry-run','--apply'].includes(args[0]))throw new Error('使い方: node migrate-ratings.cjs --dry-run または --apply');
 if(process.env.FIRESTORE_EMULATOR_HOST)throw new Error('エミュレーターが指定されています。本番移行を行わず停止しました。');
 const {initializeApp,applicationDefault}=require('firebase-admin/app'),{getFirestore,FieldValue,FieldPath}=require('firebase-admin/firestore');
 initializeApp({credential:applicationDefault(),projectId:'testo-movie-site'});
 const {getSecurityRules}=require('firebase-admin/security-rules');
 const fs=require('node:fs'),path=require('node:path');
 const normalize=s=>s.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
 const expected=normalize(fs.readFileSync(path.join(__dirname,'../../firestore.rules'),'utf8'));
 const released=await getSecurityRules().getFirestoreRuleset();
 if(released.source.length!==1||normalize(released.source[0].content)!==expected)throw new Error('公開中のFirestoreルールが今回のファイルと一致しません。先にルールをデプロイしてください。');
 console.log('公開中のFirestoreルールとの一致を確認しました。');
 const result=await migrateAll({db:getFirestore(),FieldValue,FieldPath,apply:args[0]==='--apply'});
 console.log(result.applied?'移行完了。評価者は本人専用データへ移しました。':'確認のみ完了。まだデータは変更していません。');console.log(JSON.stringify(result));
})().catch(error=>{console.error('移行を停止しました: '+error.message);process.exitCode=1;});}
module.exports={migrateOne,migrateAll,fingerprint};
