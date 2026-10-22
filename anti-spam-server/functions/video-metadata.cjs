'use strict';
const ALLOWED = new Set(['interactionSettingsVersion','title','desc','category','thumbUrl','mutedCommentWords','danmakuEnabled','commentsEnabled','dislikesEnabled']);
function fail(message){const error=new Error(message);error.invalidUpload=true;return error;}
function cleanDetails(value,required=false) {
 if (!value||typeof value!=='object'||Array.isArray(value)) throw fail('動画の設定を確認してください。');
 const result={};
 for(const key of Object.keys(value)) {
  if (!ALLOWED.has(key)) throw fail('変更できない動画設定が含まれています。');
  const v=value[key];if(typeof v!=='string')throw fail('動画の設定は文字列で送信してください。');
  if (key === 'interactionSettingsVersion') {
  if (v !== '1') {
    throw fail('動画設定のバージョンを確認してください。');
  }
} else if (['danmakuEnabled', 'commentsEnabled', 'dislikesEnabled'].includes(key)) {
   if(!['true','false'].includes(v))throw fail('動画機能の設定を確認してください。');
  }else if(key==='mutedCommentWords') {
   let words;try{words=JSON.parse(v);}catch{throw fail('ミュートワードを確認してください。');}
   if(!Array.isArray(words)||words.length>30||words.some(w=>typeof w!=='string'||!w.trim()||w.length>30))throw fail('ミュートワードを確認してください。');
  }else if(v.length>({title:1000,desc:6000,category:100,thumbUrl:4096}[key]||0))throw fail('動画の設定が長すぎます。');
  result[key]=v;
 }
 if(required&&(!result.title?.trim()||!result.category?.trim()))throw fail('タイトルとカテゴリーを入力してください。');
 if(Buffer.byteLength(JSON.stringify(result),'utf8')>7000)throw fail('動画の設定が大きすぎます。');
 return result;
}
async function validateThumbnail(bucket,uid,value,previous='') {
 if(!value||value===previous)return;
 let url;try{url=new URL(value);}catch{throw fail('サムネイルの保存先を確認してください。');}
 const prefix='/v0/b/'+encodeURIComponent(bucket.name)+'/o/';
 if(url.protocol!=='https:'||url.hostname!=='firebasestorage.googleapis.com'||url.username||url.password||!url.pathname.startsWith(prefix))throw fail('このサイトに保存したサムネイルを選んでください。');
 let name;try{name=decodeURIComponent(url.pathname.slice(prefix.length));}catch{throw fail('サムネイルを確認してください。');}
 if(!name.startsWith('thumbnails/'))throw fail('サムネイルの保存先を確認してください。');
 const [metadata]=await bucket.file(name).getMetadata();
 if(metadata.metadata?.uploaderUid!==uid||!/^image\/(jpeg|png|webp|gif)$/.test(metadata.contentType||''))throw fail('自分のサムネイルだけ指定できます。');
}
module.exports={cleanDetails,validateThumbnail};
