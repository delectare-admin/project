import {createUiIcon} from './ui-icons-v1.mjs?v=20261022';
const text=(ja,en)=>document.documentElement.lang==='en'?en:ja;
const el=(tag,css,value)=>{const n=document.createElement(tag);if(css)n.className=css;if(value!==undefined)n.textContent=value;return n;};
const button=(label,fn,css='')=>{const n=el('button',css,label);n.type='button';if(fn)n.addEventListener('click',fn);return n;};
const str=(value,max=2000)=>typeof value==='string'?value.slice(0,max):'';
export function safeChannelUrl(value){try{if(typeof value!=='string'||value.length>4096)return '';const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
const time=v=>{const n=Date.parse(v.uploadedAt);return Number.isFinite(n)?n:0;};
const searchKey=value=>str(value,10000).normalize('NFKC').toLocaleLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));

// This controller uses the site's existing authenticated subscription transaction and video cards.
export function mountChannelPage(a){
 const screen=document.getElementById('channelScreen'),header=screen.querySelector('.channel-header'),grid=document.getElementById('channelGrid'),name=document.getElementById('channelPageTitle'),avatar=document.getElementById('channelAvatarHeader'),handle=document.getElementById('channelHandle'),count=document.getElementById('channelSubscriberCount'),videoCount=document.getElementById('channelVideoCount'),info=screen.querySelector('.channel-info-main'),actions=screen.querySelector('.channel-actions-row'),customize=document.getElementById('customizeBtn'),manage=document.getElementById('manageVideoBtn');
 screen.classList.add('cp-channel');header.classList.add('cp-profile');screen.setAttribute('aria-labelledby','channelPageTitle');
 const meta=screen.querySelector('.channel-meta-stats'),handleLabel=el('span'),subscriberLabel=el('span'),videosLabel=el('span');handleLabel.append('@',handle);subscriberLabel.append(text('チャンネル登録者数 ',''),count,text('人',' subscribers'));videosLabel.append(videoCount,text(' 本の動画',' videos'));meta.replaceChildren(handleLabel,el('span','','·'),subscriberLabel,el('span','','·'),videosLabel);
 const banner=el('div','cp-banner');banner.hidden=true;header.before(banner);
 const bioButton=button('',()=>openAbout(),'cp-bio-button'),linksRow=el('div','cp-links'),subscribe=button('',()=>void changeSubscription(),'cp-subscribe'),subStatus=el('p','cp-sub-status');subStatus.setAttribute('role','status');
 const bio=el('span','cp-bio-excerpt'),more=el('strong','',text('さらに表示','More'));bioButton.append(bio,more);info.insertBefore(bioButton,actions);info.insertBefore(linksRow,actions);actions.append(subscribe);info.append(subStatus);
 const tabs=el('div','cp-tabs'),tabList=el('div','cp-tab-list');tabList.setAttribute('role','tablist');tabList.setAttribute('aria-label',text('チャンネルの項目','Channel sections'));tabs.append(tabList);
 const panel=el('section','cp-panel');panel.id='channelContentPanel';panel.setAttribute('role','tabpanel');panel.tabIndex=0;
 const tabButtons=new Map();for(const [key,ja,en]of [['home','ホーム','Home'],['videos','動画','Videos'],['about','概要','About']]){const b=button(text(ja,en),()=>selectTab(key),'cp-tab');b.id='channelTab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel.id);tabButtons.set(key,b);tabList.append(b);}
 tabList.addEventListener('keydown',event=>{const list=[...tabButtons.values()],index=list.indexOf(document.activeElement);if(index<0)return;let next;if(event.key==='ArrowRight')next=(index+1)%list.length;else if(event.key==='ArrowLeft')next=(index+list.length-1)%list.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=list.length-1;else return;event.preventDefault();list[next].click();list[next].focus();});
 const searchToggle=button('',()=>{searchForm.hidden=!searchForm.hidden;if(!searchForm.hidden)searchInput.focus();else if(searchInput.value){searchInput.value='';query='';render();}},'cp-search-toggle');searchToggle.append(createUiIcon('search'));searchToggle.setAttribute('aria-label',text('チャンネル内を検索','Search this channel'));searchToggle.setAttribute('aria-controls','channelSearchForm');searchToggle.setAttribute('aria-expanded','false');
 const searchForm=el('form','cp-search');searchForm.id='channelSearchForm';searchForm.hidden=true;searchForm.setAttribute('role','search');const searchInput=el('input');searchInput.type='search';searchInput.maxLength=200;searchInput.placeholder=text('このチャンネル内で検索','Search this channel');searchInput.setAttribute('aria-label',searchInput.placeholder);const searchSubmit=button(text('検索','Search'));searchSubmit.type='submit';searchForm.append(searchInput,searchSubmit);searchForm.addEventListener('submit',event=>{event.preventDefault();query=searchInput.value.trim();selectTab('videos');});
 new MutationObserver(()=>searchToggle.setAttribute('aria-expanded',String(!searchForm.hidden))).observe(searchForm,{attributes:true,attributeFilter:['hidden']});tabList.append(searchToggle);tabs.append(searchForm);
 const feature=el('section','cp-feature'),toolbar=el('div','cp-toolbar'),heading=el('h3','cp-section-title'),viewAll=button(text('すべて表示','View all'),()=>selectTab('videos'),'cp-view-all'),sortBar=el('div','cp-sorts'),status=el('p','cp-status'),about=el('div','cp-about'),moreVideos=button(text('もっと見る','Show more'),()=>{limit+=24;render();},'cp-more-videos');status.setAttribute('role','status');toolbar.append(heading,viewAll,sortBar);
 const sortButtons=new Map();for(const [key,ja,en]of [['newest','新しい順','Latest'],['popular','人気順','Popular'],['oldest','古い順','Oldest']]){const b=button(text(ja,en),()=>void chooseOrder(key),'cp-sort');sortButtons.set(key,b);sortBar.append(b);}
 header.after(tabs,panel);panel.append(feature,toolbar,status,grid,about,moreVideos);
 let epoch=0,subEpoch=0,popEpoch=0,uid='',profile={},presentation={},videos=[],tab='home',order='newest',query='',limit=24,subscribed=null,subBusy=false,loaded=false,notice='',stopCount=null,dialog=null,returning=false;
 const scores=new Map();
 const active=(version=epoch)=>version===epoch&&uid!==''&&screen.style.display!=='none'&&screen.dataset.channelUid===uid;
 const user=()=>a.user();
 function closeAbout(){if(dialog){dialog.close();dialog=null;}}
 function clearCount(){stopCount?.();stopCount=null;}
 function image(url,alt,css){const value=safeChannelUrl(url);if(!value)return null;const img=el('img',css);img.alt=alt;img.decoding='async';img.referrerPolicy='no-referrer';img.src=value;return img;}
 function setIdentity(){
  const channelName=str(profile.channelName,120)||str(videos[0]?.uploaderName,120)||text('チャンネル','Channel');name.textContent=channelName;
  const fallback=channelName.normalize('NFKC').toLowerCase().replace(/\s/g,'');handle.textContent=str(presentation.handle,40).replace(/^@/,'')||fallback;
  avatar.style.backgroundImage='none';avatar.replaceChildren();const img=image(profile.avatarUrl,'','cp-avatar-image');if(img){img.addEventListener('error',()=>{if(avatar.contains(img))avatar.replaceChildren(el('span','',channelName.slice(0,1).toUpperCase()));},{once:true});avatar.append(img);}else avatar.textContent=channelName.slice(0,1).toUpperCase();
  videoCount.textContent=loaded?String(videos.length):'—';const description=str(presentation.bio);bio.textContent=description||text('チャンネルの詳細を見る','View channel details');bioButton.classList.toggle('cp-no-bio',!description);
  banner.replaceChildren();const bannerImage=image(presentation.bannerUrl,text('チャンネルバナー','Channel banner'),'cp-banner-image');banner.hidden=!bannerImage;if(bannerImage){bannerImage.addEventListener('error',()=>{if(banner.contains(bannerImage))banner.hidden=true;},{once:true});banner.append(bannerImage);}
  const links=validLinks();linksRow.replaceChildren();linksRow.hidden=!links.length;if(links.length){const icon=createUiIcon('share'),first=link(links[0]);linksRow.append(icon,first);if(links.length>1)linksRow.append(button(text('他'+(links.length-1)+'件のリンク','and '+(links.length-1)+' more links'),openAbout,'cp-other-links'));}
  syncActions();
 }
 function validLinks(){return(Array.isArray(presentation.links)?presentation.links:[]).slice(0,5).filter(x=>x&&safeChannelUrl(x.url)).map(x=>({title:str(x.title,100)||new URL(x.url).hostname,url:safeChannelUrl(x.url)}));}
 function link(item){const n=el('a','',item.title);n.href=item.url;n.target='_blank';n.rel='noopener noreferrer';return n;}
 function syncActions(){const owner=!!user()&&user().uid===uid;customize.style.display=owner?'block':'none';manage.style.display=owner?'block':'none';subscribe.hidden=owner;
  subscribe.replaceChildren();subscribe.disabled=subBusy;subscribe.classList.toggle('cp-subscribed',subscribed===true);subscribe.setAttribute('aria-pressed',String(subscribed===true));
  if(subscribed)subscribe.append(createUiIcon('bell'));subscribe.append(el('span','',subBusy?text('確認中…','Checking…'):subscribed===null&&user()?text('登録状態を再確認','Retry subscription status'):subscribed?text('登録済み','Subscribed'):text('チャンネル登録','Subscribe')));
 }
 async function refreshSubscription(){
  const version=++subEpoch,channel=uid,viewer=user()?.uid||'';subBusy=false;subscribed=viewer?null:false;subStatus.textContent='';if(!active())return;syncActions();if(!viewer||viewer===channel)return;
  subBusy=true;syncActions();try{const value=await a.readSubscription(channel);if(version!==subEpoch||!active()||uid!==channel||user()?.uid!==viewer)return;subscribed=value===true;}
  catch{if(version===subEpoch&&active())subStatus.textContent=text('登録状態を読み込めませんでした。もう一度お試しください。','Could not load subscription status. Please retry.');}
  finally{if(version===subEpoch&&active()){subBusy=false;syncActions();}}
 }
 async function changeSubscription(){
  if(!active()||subBusy)return;if(!user()){a.login();return;}if(user().uid===uid)return;if(subscribed===null){void refreshSubscription();return;}
  const version=++subEpoch,channel=uid,viewer=user().uid;subBusy=true;subStatus.textContent='';syncActions();
  try{const result=await a.subscribe(channel,!subscribed);if(version!==subEpoch||!active()||uid!==channel||user()?.uid!==viewer)return;subscribed=result.active===true;if(Number.isInteger(result.count)&&result.count>=0)count.textContent=String(result.count);}
  catch{if(version===subEpoch&&active()&&user()?.uid===viewer)subStatus.textContent=text('チャンネル登録を変更できませんでした。少し待って再度お試しください。','Could not change the subscription. Please try again shortly.');}
  finally{if(version===subEpoch&&active()){subBusy=false;syncActions();}}
 }
 function aboutContents(host){host.replaceChildren();host.append(el('h3','',text('チャンネルについて','About this channel')),el('p','cp-about-bio',str(presentation.bio)||text('説明はありません。','No description.')));const links=validLinks();if(links.length){host.append(el('h4','',text('リンク','Links')));const list=el('ul','cp-about-links');for(const item of links){const row=el('li');row.append(link(item));list.append(row);}host.append(list);}const details=el('dl','cp-about-facts');for(const [key,value]of [[text('チャンネル','Channel'),name.textContent],[text('ハンドル','Handle'),'@'+handle.textContent],[text('動画','Videos'),videoCount.textContent]]){details.append(el('dt','',key),el('dd','',value));}host.append(details);}
 function openAbout(){if(!active())return;closeAbout();const d=el('dialog','cp-about-dialog'),top=el('div','cp-about-dialog-heading'),title=el('h2','',name.textContent),close=button('',()=>d.close(),'cp-about-close'),body=el('div','cp-about-dialog-body');close.append(createUiIcon('close'));close.setAttribute('aria-label',text('閉じる','Close'));title.id='channelAboutDialogTitle';d.setAttribute('aria-labelledby',title.id);top.append(title,close);aboutContents(body);d.append(top,body);document.body.append(d);dialog=d;d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;},{once:true});d.showModal();close.focus();}
 function selectTab(next){if(!active())return;if(next==='home'){query='';searchInput.value='';searchForm.hidden=true;}tab=next;limit=24;render();}
 function eligibleVideos(){return videos.filter(v=>a.visible(v));}
 function render(){if(!active())return;
  panel.setAttribute('aria-labelledby','channelTab-'+tab);for(const [key,b]of tabButtons){b.setAttribute('aria-selected',String(key===tab));b.tabIndex=key===tab?0:-1;}
  const aboutMode=tab==='about';about.hidden=!aboutMode;feature.hidden=true;toolbar.hidden=aboutMode;grid.hidden=aboutMode;moreVideos.hidden=true;status.textContent=notice;
  a.clearCards();if(aboutMode){aboutContents(about);return;}
  heading.textContent=query?text('検索結果','Search results'):text('動画','Videos');viewAll.hidden=tab!=='home';sortBar.hidden=tab!=='videos';for(const [key,b]of sortButtons)b.setAttribute('aria-pressed',String(key===order));
  let list=eligibleVideos();if(query){const words=searchKey(query).split(/\s+/).filter(Boolean);list=list.filter(v=>words.every(word=>searchKey(v.title+' '+(v.desc||'')).includes(word)));}
  list=[...list].sort((x,y)=>order==='popular'?(scores.get(y.itemRef.fullPath)?.value??-1)-(scores.get(x.itemRef.fullPath)?.value??-1)||time(y)-time(x):order==='oldest'?time(x)-time(y):time(y)-time(x));
  if(tab==='home'&&!query){const chosen=(returning?presentation.returningVideo||presentation.featuredVideo:presentation.featuredVideo||presentation.returningVideo),v=list.find(v=>v.itemRef.fullPath===chosen);if(v){feature.hidden=false;feature.replaceChildren();const copy=el('div','cp-feature-copy');copy.append(el('p','cp-feature-label',returning?text('おすすめの動画','Recommended video'):text('チャンネル紹介','Channel trailer')),el('h3','',str(v.title,1000)),el('p','',str(v.desc,300)),button(text('動画を見る','Watch video'),()=>a.openVideo(v),'cp-feature-play'));const cover=button('',()=>a.openVideo(v),'cp-feature-cover');cover.setAttribute('aria-label',str(v.title,1000));const img=image(v.thumbUrl,'','');if(img)cover.append(img);else cover.append(createUiIcon('play'));feature.append(cover,copy);}}
  const shown=list.slice(0,tab==='home'?12:limit);a.renderVideos(shown,grid);if(!list.length)grid.replaceChildren(el('p','empty-list-msg',loaded?text(query?'一致する動画はありません。':'動画はまだありません。',query?'No matching videos.':'No videos yet.'):text('読み込み中…','Loading…')));moreVideos.hidden=tab!=='videos'||list.length<=limit;
 }
 async function chooseOrder(next){if(!active())return;order=next;limit=24;const version=++popEpoch;sortButtons.get('popular').removeAttribute('aria-busy');render();if(next!=='popular')return;const token=epoch;status.textContent=text('再生数を読み込み中…','Loading view counts…');sortButtons.get('popular').setAttribute('aria-busy','true');let index=0,failed=false;const list=eligibleVideos();
  async function worker(){while(index<list.length&&active(token)&&version===popEpoch){const v=list[index++],id=v.itemRef.fullPath,hit=scores.get(id);if(hit&&Date.now()-hit.at<60000)continue;try{const value=await a.views(v);if(!active(token)||version!==popEpoch)return;if(scores.size>=500)scores.delete(scores.keys().next().value);scores.set(id,{at:Date.now(),value:Number.isFinite(value)&&value>=0?value:0});}catch{failed=true;}}}
  await Promise.all(Array.from({length:Math.min(4,list.length)},worker));if(active(token)&&version===popEpoch){sortButtons.get('popular').removeAttribute('aria-busy');render();if(failed)status.textContent=text('一部の再生数を読み込めませんでした。取得できた動画から表示しています。','Some view counts could not be loaded. Videos with known counts appear first.');}
 }
 async function open(channel){
  if(typeof channel!=='string'||!channel||channel.length>128||channel.includes('/')||['null','undefined'].includes(channel))return;const token=++epoch;++popEpoch;++subEpoch;uid=channel;screen.dataset.channelUid=uid;closeAbout();clearCount();a.clearCards();loaded=false;videos=[];profile={};presentation={};tab='home';order='newest';query='';limit=24;notice='';subscribed=null;subBusy=!!user()&&user().uid!==channel;searchInput.value='';searchForm.hidden=true;subStatus.textContent='';count.textContent='—';screen.setAttribute('aria-busy','true');setIdentity();render();void refreshSubscription();
  try{const key='yuruyuru-channel-visit-v1:'+uid;returning=localStorage.getItem(key)==='1';localStorage.setItem(key,'1');}catch{returning=false;}
  const results=await Promise.allSettled([a.loadVideos(),a.profile(channel)]);if(!active(token))return;
  videos=(results[0].status==='fulfilled'?results[0].value:a.cachedVideos()).filter(v=>v.uploaderUid===channel);profile=results[1].status==='fulfilled'&&results[1].value&&typeof results[1].value==='object'?results[1].value:{};loaded=true;
  if(results[0].status==='rejected')notice=text('動画一覧をすべて取得できませんでした。ページを開き直してお試しください。','Could not load every video. Reopen the channel to retry.');
  setIdentity();stopCount=a.observeCount(channel,count);screen.setAttribute('aria-busy','false');render();
  try{const result=await a.presentation(channel);if(!active(token))return;presentation=result?.channel&&typeof result.channel==='object'?result.channel:{};setIdentity();render();}catch{if(active(token))status.textContent=text('チャンネルの追加情報を読み込めませんでした。動画は引き続きご覧いただけます。','Could not load additional channel details. Videos remain available.');}
 }
 let authViewer=user()?.uid||'';a.onAuth(()=>{const next=user()?.uid||'';if(next===authViewer)return;authViewer=next;closeAbout();if(active()){syncActions();void refreshSubscription();}});
 document.addEventListener('submovie-subscription-change',event=>{if(active()&&event.detail?.channelUid===uid&&!subBusy)void refreshSubscription();});
 new MutationObserver(()=>{if(screen.style.display==='none'){++epoch;++subEpoch;++popEpoch;closeAbout();clearCount();a.clearCards();}}).observe(screen,{attributes:true,attributeFilter:['style']});
 return{open};
}
