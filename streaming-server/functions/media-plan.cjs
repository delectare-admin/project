'use strict';
const {createHash}=require('node:crypto');
const PROFILE='adaptive-v1',MAX_SOURCE_BYTES=512*1024*1024,MAX_OUTPUT_BYTES=768*1024*1024,MAX_SECONDS=1200;
const HEIGHTS=[144,240,360,480,720],BITRATES={144:120000,240:240000,360:480000,480:800000,720:1600000};
function safeRuntime(version){const m=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);if(!m)return false;const[,major,minor,patch]=m.map(Number);const required={22:[23,4],24:[22,1],26:[12,1]}[major];return !!required&&(minor>required[0]||minor===required[0]&&patch>=required[1]);}
function validName(name){return typeof name==='string'&&name.startsWith('videos/')&&name.length>7&&Buffer.byteLength(name)<=1500&&!/[\u0000-\u001f\u007f]/.test(name)&&!name.split('/').some(p=>p==='.'||p==='..');}
function idFor(name){if(!validName(name))throw Error('invalid-source-name');return createHash('sha256').update(name).digest('hex');}
function jobFor(name,generation){if(!/^\d+$/.test(String(generation)))throw Error('invalid-generation');return createHash('sha256').update(name+'\n'+generation).digest('hex');}
function mediaUrl(bucket,name,token){return 'https://firebasestorage.googleapis.com/v0/b/'+encodeURIComponent(bucket)+'/o/'+encodeURIComponent(name)+'?alt=media&token='+encodeURIComponent(token);}
function catalogEntry(name,metadata){
 if(!validName(name)||!/^\d+$/.test(String(metadata.generation))||!String(metadata.contentType||'').startsWith('video/'))return null;
 const raw=metadata.metadata||{};if(raw.uploadValidation&&raw.uploadValidation!=='ready')return null;
 const limits={title:1000,desc:10000,category:100,uploaderUid:128,uploaderName:200,thumbUrl:4096,mutedCommentWords:20000,danmakuEnabled:5,commentsEnabled:5,dislikesEnabled:5,hlsUrl:4096,hlsSourceGeneration:50,streamProfile:40};
 const publicMetadata={};for(const[key,max]of Object.entries(limits))if(typeof raw[key]==='string')publicMetadata[key]=raw[key].slice(0,max);
 const timestamp=Date.parse(metadata.timeCreated||metadata.created);if(!Number.isFinite(timestamp))return null;
 return {schemaVersion:1,fullPath:name,generation:String(metadata.generation),uploadedAt:new Date(timestamp).toISOString(),publicMetadata};
}
function planFor(probe){
 const streams=Array.isArray(probe.streams)?probe.streams:[],video=streams.find(s=>s.codec_type==='video'&&!Number(s.disposition?.attached_pic||0));
 if(!video)throw Error('no-video-stream');
 let width=Number(video.width),height=Number(video.height);const rotation=Number(video.tags?.rotate??video.side_data_list?.find(d=>d.rotation!==undefined)?.rotation)||0;
 if(Math.abs(rotation)%180===90)[width,height]=[height,width];
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width>4096||height>4096)throw Error('source-dimensions-limit');
 const duration=Math.max(...[probe.format?.duration,...streams.map(s=>s.duration)].map(Number).filter(Number.isFinite));
 if(!Number.isFinite(duration)||duration<=0||duration>MAX_SECONDS)throw Error('source-duration-limit');
 const heights=HEIGHTS.filter(h=>h<=height);if(!heights.length)heights.push(Math.floor(height/2)*2);
 const variants=heights.map(h=>({height:h,width:Math.max(2,Math.floor(width*h/height/2)*2),bitrate:BITRATES[h]||120000}));
 const index=Number(video.index);if(!Number.isSafeInteger(index)||index<0||index>100)throw Error('invalid-stream-index');
 return {duration,videoIndex:index,hasAudio:streams.some(s=>s.codec_type==='audio'),variants};
}
function ffmpegArgs(source,directory,plan){
 const n=plan.variants.length,filter='[0:'+plan.videoIndex+']fps=30,split='+n+plan.variants.map((_,i)=>'[in'+i+']').join('')+';'+plan.variants.map((v,i)=>'[in'+i+']scale='+v.width+':'+v.height+':flags=fast_bilinear,setsar=1,format=yuv420p[v'+i+']').join(';');
 const args=['-hide_banner','-loglevel','error','-nostdin','-max_alloc','268435456','-protocol_whitelist','file','-format_whitelist','mov,matroska,webm,avi,flv,mpeg,mpegts,ogg,asf','-probesize','33554432','-analyzeduration','10000000','-threads','2','-i',source,'-filter_complex_threads','1','-filter_complex',filter];
 for(let i=0;i<n;i++){args.push('-map','[v'+i+']');if(plan.hasAudio)args.push('-map','0:a:0');}
 args.push('-map_metadata','-1','-sn','-dn','-c:v','libx264','-preset','veryfast','-profile:v','main','-pix_fmt','yuv420p','-threads:v','2','-g','120','-keyint_min','120','-sc_threshold','0','-force_key_frames','expr:gte(t,n_forced*4)');
 plan.variants.forEach((v,i)=>args.push('-b:v:'+i,String(v.bitrate),'-maxrate:v:'+i,String(Math.ceil(v.bitrate*1.25)),'-bufsize:v:'+i,String(v.bitrate*2)));
 if(plan.hasAudio)args.push('-c:a','aac','-b:a','64000','-ac','2');
 args.push('-max_muxing_queue_size','1024','-f','hls','-hls_time','4','-hls_playlist_type','vod','-hls_flags','independent_segments','-hls_segment_filename',directory+'/v%v_%05d.ts','-var_stream_map',plan.variants.map((_,i)=>'v:'+i+(plan.hasAudio?',a:'+i:'')).join(' '),'-y',directory+'/v%v.m3u8');return args;
}
function rewriteVariant(text,files,prefix,bucket,token){
 if(!text.startsWith('#EXTM3U')||!text.includes('#EXT-X-ENDLIST')||/URI\s*=/i.test(text))throw Error('playlist-incomplete');
 return text.split(/\r?\n/).map(line=>{if(!line||line.startsWith('#'))return line;if(!/^v\d+_\d{5}\.ts$/.test(line)||!files.has(line))throw Error('playlist-reference-invalid');return mediaUrl(bucket,prefix+line,token);}).join('\n');
}
function masterPlaylist(plan,prefix,bucket,token){return '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n'+plan.variants.map((v,i)=>'#EXT-X-STREAM-INF:BANDWIDTH='+Math.ceil((v.bitrate+(plan.hasAudio?64000:0))*1.3)+',RESOLUTION='+v.width+'x'+v.height+',FRAME-RATE=30.000\n'+mediaUrl(bucket,prefix+'v'+i+'.m3u8',token)).join('\n')+'\n';}
module.exports={PROFILE,MAX_SOURCE_BYTES,MAX_OUTPUT_BYTES,MAX_SECONDS,HEIGHTS,safeRuntime,validName,idFor,jobFor,mediaUrl,catalogEntry,planFor,ffmpegArgs,rewriteVariant,masterPlaylist};
