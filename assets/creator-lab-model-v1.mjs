export function safeHttps(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return'';}}
export function parseChapters(text){return text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const m=/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/.exec(line);if(!m)throw Error('チャプターは「0:00 はじめに」のように入力してください。');const parts=m[1].split(':').map(Number);if(parts.slice(1).some(x=>x>59))throw Error('チャプターの秒・分を確認してください。');return{time:parts.reduce((n,x)=>n*60+x,0),title:m[2]};});}
export function clock(seconds){const n=Math.max(0,Math.floor(Number(seconds)||0)),s=String(n%60).padStart(2,'0'),m=Math.floor(n/60);return m>=60?Math.floor(m/60)+':'+String(m%60).padStart(2,'0')+':'+s:m+':'+s;}
export function recommendationOrder(videos,{history=[],subscriptions=[],now=Date.now()}={}){
 const byId=new Map(videos.map(v=>[v.itemRef.fullPath,v])),categories=new Map(),seen=new Map(history.map((id,i)=>[id,i]));
 history.slice(0,30).forEach((id,i)=>{const v=byId.get(id);if(v)categories.set(v.category,(categories.get(v.category)||0)+(30-i)/30);});
 const subscribed=new Set(subscriptions),day=Math.floor(now/86400000);
 const score=v=>{const age=Math.max(0,(now-(Date.parse(v.uploadedAt)||0))/86400000);let hash=day;for(const ch of v.itemRef.fullPath)hash=(Math.imul(hash,31)+ch.charCodeAt(0))|0;return 5/(1+age/14)+Math.min(3,categories.get(v.category)||0)+(subscribed.has(v.uploaderUid)?1.5:0)+(Math.abs(hash)%100)/500-(seen.has(v.itemRef.fullPath)?3:0);};
 return [...videos].sort((a,b)=>score(b)-score(a)||a.itemRef.fullPath.localeCompare(b.itemRef.fullPath));
}
export async function mapLimited(values,fn,concurrency=4){const result=new Array(values.length);let next=0;async function work(){while(next<values.length){const i=next++;result[i]=await fn(values[i],i);}}await Promise.all(Array.from({length:Math.min(concurrency,values.length)},work));return result;}
export function formatCount(n){return Number.isFinite(Number(n))?Math.max(0,Math.floor(Number(n))).toLocaleString('ja-JP'):'—';}
