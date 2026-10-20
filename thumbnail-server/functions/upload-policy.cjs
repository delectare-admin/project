'use strict';
// YouTube's documented per-video ceiling; existing 10 reservations/day is retained.
const MAX_VIDEO_BYTES = 256000000000;
const MAX_VIDEO_SECONDS = 12 * 60 * 60;
const POLICY_VERSION = 3;
const TYPES = Object.freeze({
  mp4:'video/mp4',m4v:'video/mp4',mpeg4:'video/mp4',mov:'video/quicktime',
  mpg:'video/mpeg',mpeg:'video/mpeg',mpeg1:'video/mpeg',mpeg2:'video/mpeg',mpegps:'video/mpeg',
  avi:'video/x-msvideo',wmv:'video/x-ms-wmv',flv:'video/x-flv',
  '3gp':'video/3gpp','3gpp':'video/3gpp','3g2':'video/3gpp2',webm:'video/webm',mkv:'video/x-matroska'
});
const MIME_ALIASES = Object.freeze({
  mp4:['video/mp4','video/x-m4v','application/mp4'],m4v:['video/mp4','video/x-m4v'],
  mov:['video/quicktime','video/mov'],avi:['video/x-msvideo','video/avi','video/msvideo'],
  wmv:['video/x-ms-wmv'],flv:['video/x-flv','video/flv'],mkv:['video/x-matroska','video/matroska']
});
function invalid(message) { const error=new Error(message);error.invalidUpload=true;return error; }
function validateReservation(data) {
  if (!Number.isSafeInteger(data.size)||data.size<=0||data.size>MAX_VIDEO_BYTES) {
    throw invalid('動画は1本256GB以下にしてください。空のファイルは投稿できません。');
  }
  if (typeof data.name!=='string'||!data.name.trim()||data.name.length>200||/[\u0000-\u001f\u007f]/.test(data.name)) {
    throw invalid('動画ファイル名を確認してください。');
  }
  const suffix=data.name.split('.').pop().toLowerCase();
  if (!Object.hasOwn(TYPES,suffix)) throw invalid('対応する動画形式を選んでください（MP4・MOV・WebMなど）。');
  const supplied=typeof data.contentType==='string'?data.contentType.trim().toLowerCase():'';
  const aliases=MIME_ALIASES[suffix]||[TYPES[suffix]];
  // An absent/generic browser MIME may be inferred only from a recognized container suffix.
  // The private object is still inspected by the server before it can become public.
  if (supplied&&supplied!=='application/octet-stream'&&!aliases.includes(supplied)) {
    throw invalid('動画の形式とファイル名が一致しません。');
  }
  return {name:data.name.trim().replace(/[<>:"/\\|?*]/g,'_'),contentType:TYPES[suffix]};
}
function validateProbe(value) {
  const streams=(Array.isArray(value.streams)?value.streams:[]).filter(s=>s.codec_type==='video'&&Number(s.disposition?.attached_pic||0)===0);
  if (!streams.length) throw invalid('再生できる映像が見つかりません。動画ファイルを選んでください。');
  const times=[Number(value.format?.duration),...streams.map(s=>Number(s.duration))].filter(x=>Number.isFinite(x)&&x>0);
  if (!times.length) throw invalid('動画の長さを確認できませんでした。MP4などに変換してから投稿してください。');
  const duration=Math.max(...times);
  if (duration>MAX_VIDEO_SECONDS) throw invalid('動画は1本12時間以内にしてください。');
  const main=streams[0],width=Number(main.width),height=Number(main.height);
  if (!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width>16384||height>16384) {
    throw invalid('動画の解像度を確認できませんでした。');
  }
  return {duration,width,height,codec:String(main.codec_name||'unknown')};
}
module.exports={MAX_VIDEO_BYTES,MAX_VIDEO_SECONDS,POLICY_VERSION,TYPES,validateReservation,validateProbe,invalid};
