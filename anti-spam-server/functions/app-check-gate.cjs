'use strict';
function createAppCheckGate({policy,getAppCheck,log=()=>{}}){
 if(!['monitor','enforce'].includes(policy.mode)||!policy.appId)throw new Error('App Check設定が不正です。');
 let lastCallWarning=0,lastHttpWarning=0;
 function callable(request){
  const valid=!!request.app&&request.app.appId===policy.appId;
  if(!valid&&Date.now()-lastCallWarning>60000){lastCallWarning=Date.now();log('app-check-callable-unverified');}
  return valid||policy.mode==='monitor';
 }
 async function http(request){
  const token=request.get('X-Firebase-AppCheck');let valid=false;
  if(typeof token==='string'&&token.length>0&&token.length<=8192){try{const claims=await getAppCheck().verifyToken(token);valid=claims.appId===policy.appId;}catch{}}
  if(!valid&&Date.now()-lastHttpWarning>60000){lastHttpWarning=Date.now();log('app-check-upload-unverified');}
  return valid||policy.mode==='monitor';
 }
 return{callable,http};
}
module.exports={createAppCheckGate};
