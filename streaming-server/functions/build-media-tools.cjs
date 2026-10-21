'use strict';
// Build-time only. No credentials, user files or project data leave this process.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises');
const {spawnSync}=require('node:child_process');
const SOURCE=Object.freeze({
 url:'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-30-13-08/ffmpeg-n8.1.3-9-g29e619e767-linux64-gpl-8.1.tar.xz',
 sha256:'97ce978979194b5cf7e06a5e68020dbdaa7a4f3294c5452b6a1bc347100dbb79',
 directory:'ffmpeg-n8.1.3-9-g29e619e767-linux64-gpl-8.1',
 version:'n8.1.3-9-g29e619e767',
 buildRepository:'https://github.com/BtbN/FFmpeg-Builds',
 ffmpegSource:'https://github.com/FFmpeg/FFmpeg/commit/29e619e767'
});
function download(url,target,redirects=0) {
 if(redirects>6)throw new Error('メディアツールの転送回数が多すぎます。');
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname))throw new Error('配布元以外への転送を拒否しました。');
 return new Promise((resolve,reject)=>{
  const req=https.get(parsed,{headers:{'User-Agent':'submovie-verified-media-build'}},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){
    res.resume();download(new URL(res.headers.location,url).href,target,redirects+1).then(resolve,reject);return;
   }
   if(res.statusCode!==200){res.resume();reject(new Error('メディアツールの取得に失敗しました: HTTP '+res.statusCode));return;}
   let total=0;res.on('data',data=>{total+=data.length;if(total>200*1024*1024)res.destroy(new Error('配布ファイルが想定サイズを超えています。'));});
   pipeline(res,fs.createWriteStream(target,{flags:'wx'})).then(resolve,reject);
  });req.setTimeout(180000,()=>req.destroy(new Error('メディアツールの取得がタイムアウトしました。')));req.on('error',reject);
 });
}
async function main() {
 if(process.platform!=='linux'||process.arch!=='x64')throw new Error('この処理はFirebaseのLinux x64ビルド環境で実行してください。Windowsで手動実行する必要はありません。');
 const dir=path.join(__dirname,'.media-bin'),archive=path.join(__dirname,'.media-download.tar.xz');
 if(fs.existsSync(dir))fs.rmSync(dir,{recursive:true,force:true});
 fs.rmSync(archive,{force:true});fs.mkdirSync(dir);
 try {
  await download(SOURCE.url,archive);
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(archive))hash.update(chunk);
  if(hash.digest('hex')!==SOURCE.sha256)throw new Error('メディアツールのSHA-256が一致しません。実行せず停止しました。');
  // The entire immutable archive has been authenticated; extract only these exact files.
  for(const name of ['ffmpeg','ffprobe']) {
   const result=spawnSync('tar',['--no-same-owner','--no-same-permissions','-xJf',archive,'-C',dir,'--strip-components=2',SOURCE.directory+'/bin/'+name],{encoding:'utf8',shell:false,timeout:180000});
   if(result.status!==0)throw new Error('検証済みメディアツールの展開に失敗しました。');
   fs.chmodSync(path.join(dir,name),0o755);
   const version=spawnSync(path.join(dir,name),['-version'],{encoding:'utf8',shell:false,timeout:15000});
   if(version.status!==0||!version.stdout.startsWith(name+' version '+SOURCE.version))throw new Error('メディアツールのバージョン確認に失敗しました。');
  }
  const licence=spawnSync('tar',['--no-same-owner','--no-same-permissions','-xJf',archive,'-C',dir,'--strip-components=1',SOURCE.directory+'/LICENSE.txt'],{encoding:'utf8',shell:false,timeout:180000});
  if(licence.status!==0)throw new Error('配布元のライセンスを保存できませんでした。');
  fs.writeFileSync(path.join(dir,'BUILD-SOURCE.json'),JSON.stringify(SOURCE,null,2));
  console.log('検証済みFFmpeg / FFprobe 8.1.3を準備しました。');
 }catch(error){fs.rmSync(dir,{recursive:true,force:true});throw error;}
 finally{fs.rmSync(archive,{force:true});}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={SOURCE,main};
