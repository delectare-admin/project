'use strict';
const {spawn}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path');
const {MAX_OUTPUT_BYTES}=require('./media-plan.cjs');
async function listOutput(directory){const names=await fs.readdir(directory);let bytes=0;for(const name of names){const stat=await fs.lstat(path.join(directory,name));if(!stat.isFile()||stat.isSymbolicLink())throw Error('output-file-invalid');bytes+=stat.size;}if(names.length>2000||bytes>MAX_OUTPUT_BYTES)throw Error('output-size-limit');return {names,bytes};}
function run(binary,args,{directory,timeout=430000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],shell:false});let stdout='',reason='',settled=false,checking=false;
  const timer=setTimeout(()=>{reason='media-timeout';child.kill('SIGKILL');},timeout);
  const watcher=directory?setInterval(async()=>{if(checking||settled)return;checking=true;try{await listOutput(directory);}catch(e){reason=e.message;child.kill('SIGKILL');}finally{checking=false;}},1000):null;
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(watcher)clearInterval(watcher);error?reject(error):resolve(stdout);};
  child.stdout.on('data',data=>{stdout+=data.toString();if(stdout.length>2*1024*1024){reason='media-output-limit';child.kill('SIGKILL');}});
  // FFmpeg may print input metadata. Do not send it to logs or a public response.
  child.stderr.on('data',()=>{});child.once('error',()=>finish(Error('media-start-failed')));
  child.once('close',(code,signal)=>finish(reason||code!==0||signal?Error(reason||'media-decode-failed'):null));
 });
}
module.exports={run,listOutput};
