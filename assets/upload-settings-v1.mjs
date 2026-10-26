import {createUiIcon} from './ui-icons-v1.mjs?v=20261022';
const copy=(ja,en)=>document.documentElement.lang==='en'?en:ja;
const el=(tag,css,text)=>{const n=document.createElement(tag);if(css)n.className=css;if(text!==undefined)n.textContent=text;return n;};
const button=(text,action)=>{const n=el('button','',text);n.type='button';if(action)n.addEventListener('click',action);return n;};

export function mountMutedWordList({section,read,accountKey,remove}) {
  const details=el('details'),summary=el('summary'),title=el('span','',copy('ミュートワードリスト','Muted word list')),count=el('span','muted-word-count'),list=el('ul','muted-word-list'),status=el('p','muted-word-status');
  details.id='mutedWordsListDetails';list.id='mutedWordsList';status.setAttribute('role','status');summary.append(title,count);details.append(summary,list,status);
  section.querySelector('#blockedUsersDetails').before(details);
  let busy=false;
  function render(){
    const key=accountKey(),words=[...new Set(read().filter(word=>typeof word==='string'&&word.trim()))].slice(0,100);
    list.replaceChildren();count.textContent=' ('+words.length+')';
    status.textContent=words.length?'':copy('保存済みのミュートワードはありません。','No saved muted words.');
    for(const word of words){
      const row=el('li','muted-word-row'),text=el('div','muted-word-info'),name=el('span','muted-word-text',word),help=el('small','',copy('解除するまで有効','Muted until removed'));
      text.append(name,help);
      const unmute=button(copy('解除','Unmute'),async()=>{
        if(busy)return;
        if(accountKey()!==key){render();return;}
        busy=true;list.querySelectorAll('button').forEach(n=>n.disabled=true);
        let failed=false;try{failed=(await remove(word))===false;}catch{failed=true;}
        finally{busy=false;render();if(failed&&accountKey()===key)status.textContent=copy('解除できませんでした。設定の案内を確認してください。','Could not unmute this word. Check the settings message.');}
      });
      unmute.className='muted-word-remove';unmute.disabled=busy;unmute.prepend(createUiIcon('volume'));
      unmute.setAttribute('aria-label',copy('「'+word+'」のミュートを解除','Unmute '+word));row.append(text,unmute);list.append(row);
    }
  }
  details.addEventListener('toggle',()=>{if(details.open)render();});
  window.addEventListener('storage',event=>{if(event.key===accountKey())render();});
  render();return{render};
}

export function mountUploadStudio({chooseFile,isSending,validateDetails}) {
  const modal=document.getElementById('uploadModal');if(!modal)return null;
  const q=s=>modal.querySelector(s),picker=q('#step1Area'),pane=q('#step2Area'),layout=q('.details-layout'),form=q('.form-area'),preview=q('.studio-preview'),video=q('#previewVideo'),title=q('#videoTitleInput'),description=q('#uploadDescInput'),fileInput=q('#fileInput'),thumbInput=q('#thumbInput'),thumbPicker=q('#uploadThumbPicker'),thumbClear=q('#uploadThumbClear'),thumbName=q('#uploadThumbName'),thumbStatus=q('#uploadThumbStatus'),next=q('#uploadStudioNext'),back=q('#backModalBtn'),save=q('#saveBtn'),close=q('#closeModalBtn'),review=q('#uploadReviewPanel'),status=q('#uploadStudioStatus'),steps=q('#uploadStudioSteps'),notice=q('#uploadStudioNoticeAnchor');notice.setAttribute('role','status');
  let view=0,opened=false,opener=null,thumbnailUrl='',thumbnailInvalid=false,thumbnailEpoch=0,busyBefore=false;
  const originals=new Map();
  const stepNames=[copy('動画の選択','Select video'),copy('詳細','Details'),copy('確認・公開','Review and publish')];
  const ol=el('ol','studio-steps');for(const [i,text]of stepNames.entries()){const li=el('li'),number=el('span','studio-step-number',String(i+1)),label=el('span','',text);li.append(number,label);ol.append(li);}steps.replaceChildren(ol);steps.setAttribute('aria-label',copy('アップロードの手順','Upload steps'));
  q('#uploadDropHeading').textContent=copy('動画ファイルをドラッグ＆ドロップしてアップロード','Drag and drop a video file to upload');
  q('#uploadDropHelp').textContent=copy('または、下のボタンから動画を選択してください。','Or choose a video using the button below.');
  picker.setAttribute('role','group');picker.setAttribute('aria-labelledby','uploadDropHeading');
  q('#uploadAdvancedTitle').textContent=copy('コメント・弾幕などの設定','Comments and danmaku settings');
  next.textContent=copy('次へ','Next');thumbClear.textContent=copy('画像を解除','Remove image');
  const thumbIcon=createUiIcon('plus'),thumbLabel=el('span','',copy('ファイルをアップロード','Upload file')),thumbImage=el('img');thumbImage.alt=copy('選択したサムネイル','Selected thumbnail');thumbImage.hidden=true;thumbPicker.replaceChildren(thumbIcon,thumbLabel,thumbImage);
  const replaceVideo=button(copy('動画を選び直す','Choose another video'),()=>{if(!isSending())fileInput.click();});replaceVideo.className='studio-replace-video';preview.append(replaceVideo);
  const reviewTitle=el('h3','',copy('公開前の確認','Review before publishing'));reviewTitle.id='uploadReviewTitle';
  const reviewGrid=el('div','studio-review-grid'),reviewText=el('div','studio-review-text');reviewGrid.append(reviewText);review.append(reviewTitle,reviewGrid,el('p','studio-publish-note',copy('「保存して公開」を押すと送信を開始し、動画の確認が完了してから公開します。','Save and publish starts the upload. Your video is published after validation.')));
  function updateCount(){q('#uploadTitleCount').textContent=title.value.length+' / 1000';}
  title.addEventListener('input',updateCount);
  function addReview(label,value){const row=el('div','studio-review-row');row.append(el('strong','',label),el('p','',value));reviewText.append(row);}
  function renderReview(){
    reviewText.replaceChildren();
    addReview(copy('タイトル','Title'),title.value.trim()||q('#previewFileName').textContent);
    addReview(copy('説明','Description'),description.value||copy('説明なし','No description'));
    addReview(copy('カテゴリー','Category'),q('#videoCategoryInput').selectedOptions[0]?.textContent||'');
    addReview(copy('サムネイル','Thumbnail'),thumbInput.files?.length?thumbInput.files[0].name:copy('動画から自動生成','Generated from the video'));
    const on=copy('オン','On'),off=copy('オフ','Off');
    addReview(copy('コメント・弾幕','Comments and danmaku'),[[copy('コメント','Comments'),'uploadCommentsEnabled'],[copy('弾幕','Danmaku'),'uploadDanmakuEnabled'],[copy('低評価','Dislikes'),'uploadDislikesEnabled']].map(([label,id])=>label+': '+(q('#'+id).checked?on:off)).join(' · '));
    addReview(copy('公開方法','Visibility'),copy('確認完了後に公開','Public after validation'));
  }
  function setView(value){
    view=value;modal.dataset.uploadStep=String(value);layout.hidden=value!==1;review.hidden=value!==2;
    if(value===2){renderReview();reviewGrid.append(preview);}else if(preview.parentNode!==layout)layout.append(preview);
    next.hidden=value!==1;save.hidden=value!==2;
    for(const [i,li]of [...ol.children].entries()){li.dataset.complete=String(i<value);if(i===value)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');}
    next.disabled=thumbnailInvalid;updateCount();updateState();
  }
  function releaseThumbnail(){thumbnailEpoch++;if(thumbnailUrl)URL.revokeObjectURL(thumbnailUrl);thumbnailUrl='';thumbImage.removeAttribute('src');thumbImage.hidden=true;thumbIcon.hidden=false;thumbLabel.hidden=false;thumbName.textContent='';thumbStatus.textContent='';thumbClear.hidden=true;thumbnailInvalid=false;next.disabled=isSending();}
  function updateState(){
    const sending=isSending();
    if(sending&&!busyBefore){for(const n of modal.querySelectorAll('button,input,textarea,select'))if(n!==save){originals.set(n,n.disabled);n.disabled=true;}}
    if(!sending&&busyBefore){status.textContent='';for(const [n,disabled]of originals)n.disabled=disabled;originals.clear();next.disabled=thumbnailInvalid;}
    busyBefore=sending;
    if(sending){status.textContent=save.textContent;q('#uploadPreviewState').textContent=copy('送信・確認中です。この画面で完了をお待ちください。','Uploading and validating. Please wait here until this completes.');}
    else {q('#uploadPreviewState').textContent=copy('このプレビューは端末内の動画です。公開操作で送信を開始します。','This is a local preview. The upload begins when you publish.');}
  }
  next.addEventListener('click',()=>{
    if(isSending()||thumbnailInvalid)return;
    try{validateDetails();status.textContent='';setView(2);reviewTitle.tabIndex=-1;reviewTitle.focus();}
    catch(error){status.textContent=error?.message||copy('入力内容を確認してください。','Please check the video details.');title.focus();}
  });
  back.addEventListener('click',event=>{
    if(isSending()){event.preventDefault();event.stopImmediatePropagation();return;}
    if(view===2){event.preventDefault();event.stopImmediatePropagation();status.textContent='';setView(1);title.focus();}
  },true);
  close.addEventListener('click',event=>{if(isSending()){event.preventDefault();event.stopImmediatePropagation();}},true);
  thumbPicker.addEventListener('click',()=>{if(!isSending())thumbInput.click();});
  thumbClear.addEventListener('click',()=>{if(isSending())return;thumbInput.value='';releaseThumbnail();next.disabled=false;});
  thumbInput.addEventListener('change',()=>{
    releaseThumbnail();const file=thumbInput.files?.[0];if(!file)return;
    thumbName.textContent=file.name;thumbClear.hidden=false;
    if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){
      thumbnailInvalid=true;next.disabled=true;thumbStatus.textContent=copy('JPEG・PNG・WebP・GIFの画像を選んでください。','Choose a JPEG, PNG, WebP or GIF image.');return;
    }
    // Large thumbnails retain upload compatibility without decoding a large local preview.
    if(file.size>20*1024*1024){thumbStatus.textContent=copy('大きい画像のためプレビューを省略します。','Preview omitted for this large image.');return;}
    const epoch=thumbnailEpoch;thumbnailUrl=URL.createObjectURL(file);next.disabled=true;
    thumbImage.onload=()=>{if(epoch!==thumbnailEpoch)return;thumbImage.hidden=false;thumbIcon.hidden=true;thumbLabel.hidden=true;thumbnailInvalid=false;next.disabled=isSending();thumbStatus.textContent='';};
    thumbImage.onerror=()=>{if(epoch!==thumbnailEpoch)return;thumbnailInvalid=true;next.disabled=true;thumbStatus.textContent=copy('画像を読み込めません。別の画像を選ぶか解除してください。','Could not load this image. Choose another image or remove it.');};
    thumbImage.src=thumbnailUrl;
  });
  picker.addEventListener('dragover',event=>{if(isSending()||!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();event.dataTransfer.dropEffect='copy';picker.dataset.dragOver='true';});
  picker.addEventListener('dragleave',event=>{if(!picker.contains(event.relatedTarget))delete picker.dataset.dragOver;});
  picker.addEventListener('drop',event=>{
    event.preventDefault();delete picker.dataset.dragOver;if(isSending())return;
    const files=event.dataTransfer?.files;
    if(files?.length!==1){notice.textContent=copy('動画を1本ずつ選択してください。','Choose one video at a time.');return;}
    chooseFile(files[0]);
  });
  modal.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();});
  modal.addEventListener('drop',event=>{if(Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();});
  const focusable=()=>[...modal.querySelectorAll('button,input,textarea,select,a[href],[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);
  modal.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(!isSending())close.click();return;}
    if(event.key==='Tab'){const nodes=focusable(),first=nodes[0],last=nodes.at(-1);if(!first){event.preventDefault();modal.focus();return;}if(event.shiftKey&&(document.activeElement===first||document.activeElement===modal)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===modal)){event.preventDefault();first.focus();}}
  });
  new MutationObserver(updateState).observe(save,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  new MutationObserver(()=>{
    const active=modal.classList.contains('active');if(active===opened)return;opened=active;
    modal.setAttribute('aria-hidden',String(!active));document.body.classList.toggle('upload-studio-open',active);
    if(active){opener=document.activeElement;queueMicrotask(()=>{if(!isSending())(view===0?q('#selectFileBtn'):title).focus();else modal.focus();});}
    else {video.pause();releaseThumbnail();if(opener?.isConnected&&opener.getClientRects().length)opener.focus();opener=null;}
  }).observe(modal,{attributes:true,attributeFilter:['class']});
  window.addEventListener('pagehide',releaseThumbnail);
  modal.setAttribute('aria-hidden','true');setView(0);
  return {reset(){releaseThumbnail();notice.textContent='';modal.querySelectorAll('.guard-notice').forEach(n=>n.remove());status.textContent='';q('#uploadAdvancedSettings').open=false;setView(0);},fileSelected(){notice.textContent='';modal.querySelectorAll('.guard-notice').forEach(n=>n.remove());status.textContent='';setView(1);title.focus();}};
}
