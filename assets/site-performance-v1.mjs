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
