'use strict';
// Offline configuration only. This accepts a PUBLIC site key, never a secret key.
const fs=require('node:fs'),path=require('node:path');
function configure(root,args){
 root=fs.realpathSync(root);const client=path.join(root,'app-check-config.js'),server=path.join(root,'anti-spam-server/functions/app-check-policy.cjs');
 if(!fs.existsSync(client)||!fs.existsSync(server))throw new Error('先に中優先度の更新を適用し、projectフォルダーで実行してください。');
 for(const p of[client,server]){let here=root;for(const part of path.relative(root,p).split(path.sep)){here=path.join(here,part);if(fs.lstatSync(here).isSymbolicLink())throw new Error('リンクの設定ファイルは更新しません。');}}
 const oldClient=fs.readFileSync(client,'utf8'),oldServer=fs.readFileSync(server,'utf8');
 const currentKey=oldClient.match(/siteKey\s*:\s*['"]([A-Za-z0-9_-]*)['"]/)?.[1];
 if(currentKey===undefined||!/mode:'(?:monitor|enforce)'/.test(oldServer)||!oldServer.includes("appId:'1:406733456438:web:60604213408ddd8d470497'"))throw new Error('App Checkの設定形式を確認してください。');
 let nextClient=oldClient,nextServer=oldServer;
 if(args.length===2&&args[0]==='--site-key'){
  if(!/^[A-Za-z0-9_-]{20,200}$/.test(args[1]))throw new Error('reCAPTCHA Enterpriseの公開サイトキーを指定してください。');
  nextClient=oldClient.replace(/siteKey\s*:\s*['"][A-Za-z0-9_-]*['"]/,"siteKey:'"+args[1]+"'");
 }else if(args.length===1&&['--enforce','--monitor'].includes(args[0])){
  if(args[0]==='--enforce'&&!currentKey)throw new Error('公開サイトキーを設定し、サイトで正常に動くことを確認してから強制してください。');
  nextServer=oldServer.replace(/mode:'(?:monitor|enforce)'/,"mode:'"+(args[0]==='--enforce'?'enforce':'monitor')+"'");
 }else throw new Error('使い方: node configure-app-check.cjs --site-key 公開キー / --enforce / --monitor');
 if(nextClient===oldClient&&nextServer===oldServer){console.log('設定済みです。変更はありません。');return;}
 const folder=path.join(path.dirname(root),'submovie-security-backups');if(fs.lstatSync(folder,{throwIfNoEntry:false})?.isSymbolicLink())throw new Error('バックアップ先がリンクのため停止しました。');fs.mkdirSync(folder,{recursive:true});const backup=fs.mkdtempSync(path.join(folder,'app-check-20261021-'));
 fs.writeFileSync(path.join(backup,'app-check-config.js'),oldClient);fs.writeFileSync(path.join(backup,'app-check-policy.cjs'),oldServer);
 try{fs.writeFileSync(client,nextClient);fs.writeFileSync(server,nextServer);}catch(error){fs.writeFileSync(client,oldClient);fs.writeFileSync(server,oldServer);throw error;}
 console.log('App Check設定を更新しました。バックアップ: '+backup);
 console.log(args[0]==='--site-key'?'app-check-config.js をGitHubへ公開し、App Checkの指標とPC・スマホの動作を確認してください。':'anti-spam のFunctionsを再デプロイすると反映されます。Firestore・Storageの強制はコンソールで別に設定します。');
}
if(require.main===module){try{configure(process.cwd(),process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={configure};
