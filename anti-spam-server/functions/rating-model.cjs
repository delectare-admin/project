'use strict';
const {createHash}=require('node:crypto');
const VERSION=2;
function problem(message){const error=new Error(message);error.ratingDataInvalid=true;return error;}
function statsKey(videoId){return videoId.replace(/\//g,'__');}
function ratingKey(kind,targetId){return (kind==='video'?'v_':'c_')+createHash('sha256').update(targetId).digest('hex');}
function count(value,fallback=0){if(value===undefined)return fallback;if(!Number.isSafeInteger(value)||value<0)throw problem('評価数のデータを確認してください。');return value;}
function legacyVotes(data){
 const read=key=>{const list=data[key]===undefined?[]:data[key];if(!Array.isArray(list)||list.some(uid=>typeof uid!=='string'||!uid||uid.length>128||uid.includes('/')))throw problem('評価者のデータを確認してください。');return[...new Set(list)];};
 const likes=read('likedUsers'),dislikes=read('dislikedUsers'),liked=new Set(likes);
 if(dislikes.some(uid=>liked.has(uid)))throw problem('高評価と低評価が重複しています。自動で変更せず停止しました。');
 if(count(data.likes,likes.length)<likes.length||count(data.dislikes,dislikes.length)<dislikes.length)throw problem('評価数と評価者数が一致しません。自動で変更せず停止しました。');
 return [...likes.map(uid=>({uid,value:'like'})),...dislikes.map(uid=>({uid,value:'dislike'}))];
}
function publicRatingData(data){
 const result={...data};delete result.likedUsers;delete result.dislikedUsers;
 result.likes=count(data.likes,(data.likedUsers||[]).length);result.dislikes=count(data.dislikes,(data.dislikedUsers||[]).length);
 result.ratingSchemaVersion=VERSION;result.ratingRevision=count(data.ratingRevision);return result;
}
function requestKey(uid,id){return createHash('sha256').update(uid+'\n'+id).digest('hex');}
module.exports={requestKey,VERSION,statsKey,ratingKey,count,legacyVotes,publicRatingData};
