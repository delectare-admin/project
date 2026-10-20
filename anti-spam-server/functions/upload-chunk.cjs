'use strict';
// The resumable session URI stays server-only: clients cannot add download tokens
// or replace trusted metadata in a final GCS upload request.
const CHUNK_BYTES=4*1024*1024;
function createChunkHandler({db,bucket,getAuth,fetchImpl=fetch}) {
 return async (request,response)=>{
  const fail=(code,message)=>response.status(code).json({error:message});
  try {
   if(request.method!=='POST')return fail(405,'POSTで送信してください。');
   const authorization=request.get('Authorization')||'';
   if(!authorization.startsWith('Bearer '))return fail(401,'ログインしてください。');
   let user;try{user=await getAuth().verifyIdToken(authorization.slice(7),true);}catch{return fail(401,'ログインし直してください。');}
   if(!user.uid||user.firebase?.sign_in_provider==='anonymous')return fail(401,'ログインしてください。');
   const id=request.query.ticketId,op=request.query.op;
   if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,300}$/.test(id)||!['status','chunk'].includes(op))return fail(400,'投稿予約を確認してください。');
   const ticketRef=db.doc('videoUploadTickets/'+id),sessionRef=db.doc('videoUploadSessions/'+id);
   const [ticketSnap,sessionSnap]=await Promise.all([ticketRef.get(),sessionRef.get()]);
   const ticket=ticketSnap.data(),session=sessionSnap.data();
   if(!ticketSnap.exists||ticket.uid!==user.uid)return fail(403,'自分の投稿だけ送信できます。');
   if(ticket.status==='ready')return response.json({offset:ticket.size,complete:true});
   if(!ticket.active||ticket.policyVersion!==3||!['uploading','validating'].includes(ticket.status)||!sessionSnap.exists||session.uid!==user.uid)return fail(409,'この投稿予約は終了しています。');
   if(Number(session.createdAtMs)+7*86400000<=Date.now())return fail(410,'動画の送信期限が切れました。選び直してください。');
   const body=Buffer.isBuffer(request.rawBody)?request.rawBody:Buffer.alloc(0);
   let range;
   if(op==='status') {if(body.length)return fail(400,'確認リクエストが不正です。');range='bytes */'+ticket.size;}
   else {
    const start=typeof request.query.start==='string'&&/^\d+$/.test(request.query.start)?Number(request.query.start):NaN;
    if(!Number.isSafeInteger(start)||start<0||!body.length||body.length>CHUNK_BYTES||start+body.length>ticket.size||start%(256*1024)!==0||(start+body.length<ticket.size&&body.length%(256*1024)!==0))return fail(400,'動画の送信位置・サイズを確認してください。');
    range=`bytes ${start}-${start+body.length-1}/${ticket.size}`;
   }
   const uri=new URL(session.uri);
   if(uri.protocol!=='https:'||uri.hostname!=='storage.googleapis.com'||uri.pathname!=='/upload/storage/v1/b/'+bucket.name+'/o'||!uri.searchParams.has('upload_id'))return fail(500,'動画の保存先を確認できませんでした。');
   const result=await fetchImpl(uri,{method:'PUT',redirect:'manual',headers:{'Content-Type':ticket.contentType,'Content-Range':range},body:op==='chunk'?body:undefined,signal:AbortSignal.timeout(110000)});
   let offset,complete=false;
   if(result.status===200||result.status===201){offset=ticket.size;complete=true;}
   else if(result.status===308){
    const saved=result.headers.get('Range');
    if(!saved)offset=0;else{const m=/^bytes=0-(\d+)$/.exec(saved);offset=m?Number(m[1])+1:NaN;}
    if(!Number.isSafeInteger(offset)||offset<0||offset>ticket.size)throw new Error('invalid-offset');
   }else{return fail(result.status===404||result.status===410?410:503,'動画を送信できませんでした。通信状態を確認して再試行してください。');}
   // Never return the GCS response body or headers (they can contain session tokens).
   if(result.body)await result.body.cancel();
   return response.json({offset,complete});
  }catch{return fail(503,'動画送信を再開できませんでした。少し待って再試行してください。');}
 };
}
module.exports={CHUNK_BYTES,createChunkHandler};
