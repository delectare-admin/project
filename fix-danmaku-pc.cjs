// PC弾幕カスタマイズ修正。Node.js標準機能のみ使用。
const ASSETS = {"css": "/* PC弾幕カスタマイズの位置と操作だけを調整。スマホの既存CSSは変更しない。 */\n#danmakuCustomizeDialog[data-pc-anchored] {\n  position:fixed; inset:auto; margin:0; width:min(410px,calc(100vw - 24px));\n  z-index:2147483000; border-radius:14px;\n}\n#danmakuCustomizeDialog[data-pc-anchored] .dc-heading { padding:10px 14px; }\n#danmakuCustomizeDialog[data-pc-anchored] .dc-preview { height:52px; margin:0 14px 10px; }\n#danmakuCustomizeDialog[data-pc-anchored] .dc-body { grid-template-columns:72px minmax(0,1fr); }\n#danmakuCustomizeDialog[data-pc-anchored] .dc-tabs { padding:10px 6px; }\n#danmakuCustomizeDialog[data-pc-anchored] .dc-tab { min-height:42px; padding:8px 2px; font-size:13px; white-space:nowrap; }\n#danmakuCustomizeDialog[data-pc-anchored] .dc-content { padding:12px 14px; }\n#danmakuCustomizeDialog[data-pc-anchored] .dc-wheel { width:190px; height:190px; }\n#danmakuCustomizeDialog[data-pc-anchored] .dc-wheel::before { inset:9%; }\n/* 四角の角や選択マーカーが、リング内周へ接触しない大きさ。 */\n#danmakuCustomizeDialog[data-pc-anchored] .dc-sv { width:50%; height:50%; left:25%; top:25%; }\n#danmakuCustomizeDialog[data-pc-anchored] .dc-footer { padding:8px 14px; }\n", "js": "  // PC弾幕カスタマイズ・ポップアップ v2\n  const pcCustomizer = window.matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)');\n  let pcPositionFrame = 0;\n  const pcDocuments = new WeakSet();\n  function pcPanelOpen() { return dialog.open && dialog.hasAttribute('data-pc-anchored'); }\n  function resetPcPlacement() {\n    cancelAnimationFrame(pcPositionFrame);\n    pcPositionFrame = 0;\n    dialog.removeAttribute('data-pc-anchored');\n    dialog.removeAttribute('aria-modal');\n    ['left','top','max-height'].forEach(name => dialog.style.removeProperty(name));\n    if (dialog.parentNode !== wrapper) wrapper.appendChild(dialog);\n  }\n  function positionPcPanel() {\n    pcPositionFrame = 0;\n    if (!pcPanelOpen()) return;\n    const owner = dialog.ownerDocument;\n    const view = owner.defaultView;\n    if (!view || !tool.isConnected || !pcCustomizer.matches) { dialog.close(); return; }\n    const videoBox = wrapper.getBoundingClientRect();\n    const toolBox = tool.getBoundingClientRect();\n    const pad = 10, gap = 8;\n    const width = view.innerWidth, height = view.innerHeight;\n    const sameDocument = tool.ownerDocument === owner;\n    // 全画面のときは、コンテナー内を基準にする。\n    const fullscreen = owner.fullscreenElement || owner.webkitFullscreenElement;\n    const useVideoEdge = !sameDocument || (fullscreen && !fullscreen.contains(tool));\n    const anchor = useVideoEdge ? {\n      left:videoBox.left + 10, top:videoBox.bottom - 12, bottom:videoBox.bottom - 12\n    } : toolBox;\n    if (!useVideoEdge && (anchor.bottom < 0 || anchor.top > height || toolBox.width === 0)) { dialog.close(); return; }\n    const availableAbove = Math.max(0,anchor.top - pad - gap);\n    const availableBelow = Math.max(0,height - anchor.bottom - pad - gap);\n    const above = availableAbove >= 240 || availableAbove >= availableBelow;\n    let available = above ? availableAbove : availableBelow;\n    // 通常は再生画面の上端から工具の直上までに収める。\n    if (above && videoBox.top >= pad && anchor.top - videoBox.top >= 300) {\n      available = Math.min(available,anchor.top - videoBox.top - gap);\n    }\n    dialog.style.maxHeight = `${Math.max(0,Math.min(540,available))}px`;\n    const box = dialog.getBoundingClientRect();\n    const left = Math.max(pad,Math.min(anchor.left,width - box.width - pad));\n    const proposedTop = above ? anchor.top - gap - box.height : anchor.bottom + gap;\n    const top = Math.max(pad,Math.min(proposedTop,height - box.height - pad));\n    const leftValue = `${Math.round(left)}px`, topValue = `${Math.round(top)}px`;\n    if (dialog.style.left !== leftValue) dialog.style.left = leftValue;\n    if (dialog.style.top !== topValue) dialog.style.top = topValue;\n  }\n  function queuePcPosition() {\n    if (pcPanelOpen() && !pcPositionFrame) pcPositionFrame = requestAnimationFrame(positionPcPanel);\n  }\n  function bindPcDocument(owner) {\n    if (!owner || pcDocuments.has(owner)) return;\n    pcDocuments.add(owner);\n    owner.addEventListener('pointerdown', event => {\n      if (!pcPanelOpen() || dialog.contains(event.target) || tool.contains(event.target)) return;\n      // パネル外は通常の操作を通す。動画へのクリックは従来どおり再生・停止。\n      dialog.close();\n    },true);\n    owner.addEventListener('keydown', event => {\n      if (!pcPanelOpen() || event.key !== 'Escape') return;\n      event.preventDefault(); event.stopPropagation(); dialog.close(); tool.focus({preventScroll:true});\n    },true);\n    owner.addEventListener('scroll',queuePcPosition,{capture:true,passive:true});\n    owner.defaultView?.addEventListener('resize',queuePcPosition);\n    owner.defaultView?.addEventListener('popstate',() => { if (pcPanelOpen()) dialog.close(); });\n    for (const eventName of ['fullscreenchange','webkitfullscreenchange']) owner.addEventListener(eventName,() => {\n      if (!pcPanelOpen()) return;\n      const full = owner.fullscreenElement || owner.webkitFullscreenElement;\n      const parent = full?.contains(wrapper) ? wrapper : owner.body;\n      if (dialog.parentNode !== parent) parent.appendChild(dialog);\n      queuePcPosition();\n    });\n  }\n  function openPcPanel() {\n    // 通常画面では動画の外へ出すことで、パネル操作がプレーヤーへ伝わらない。\n    const owner = wrapper.ownerDocument;\n    const full = owner.fullscreenElement || owner.webkitFullscreenElement;\n    const parent = full?.contains(wrapper) ? wrapper : tool.ownerDocument.body;\n    if (dialog.parentNode !== parent) parent.appendChild(dialog);\n    dialog.setAttribute('data-pc-anchored','');\n    dialog.setAttribute('aria-modal','false');\n    dialog.style.left = '0px'; dialog.style.top = '0px';\n    bindPcDocument(dialog.ownerDocument);\n    dialog.show();\n    positionPcPanel();\n  }\n  pcCustomizer.addEventListener('change',() => {\n    // 表示方式の切り替え時はいったん閉じる。次回はその端末の既存方式で開く。\n    if (dialog.open) dialog.close();\n    else resetPcPlacement();\n    render();\n  });\n  if ('ResizeObserver' in window) new ResizeObserver(queuePcPosition).observe(dialog);\n"};
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
function once(text,before,after) {
  if (text.split(before).length!==2) throw new Error('対象コードが一致しません。ファイルは未変更です: '+before.slice(0,90));
  return text.replace(before,()=>after);
}
function patchIndex(source) {
  let html=source.replace(/\r\n?/g,'\n');
  if(html.includes('// PC弾幕カスタマイズ・ポップアップ v2')) throw new Error('今回のPC修正はすでに適用済みです。ファイルは未変更です。');
  if(!html.includes('function setupDanmakuCustomization()')) throw new Error('弾幕カスタマイズを導入済みの index.html を指定してください。');
  html=once(html,'</head>','<style id="danmakuPcCustomizationStyles">\n'+ASSETS.css+'\n</style>\n</head>');
  html=once(html,"    sample.textContent = input.value.trim().slice(0, 40) || '弾幕をカスタマイズ';",
    "    sample.textContent = input.value.trim().slice(0, 40) || (pcCustomizer.matches ? '見本' : '弾幕をカスタマイズ');");
  const oldOpen=`  tool.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    if (dialog.open) return;
    // 移動先のPiPや全画面でも、プレイヤーと同じドキュメントに置く。
    if (dialog.parentNode !== wrapper) wrapper.appendChild(dialog);
    render(); dialog.showModal(); tool.setAttribute('aria-expanded', 'true');
  });`;
  const newOpen=ASSETS.js+`\n  tool.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    if (dialog.open) { if (pcPanelOpen()) dialog.close(); return; }
    render();
    if (pcCustomizer.matches) openPcPanel();
    else {
      resetPcPlacement();
      dialog.showModal();
    }
    tool.setAttribute('aria-expanded', 'true');
  });`;
  html=once(html,oldOpen,newOpen);
  html=once(html,"  dialog.addEventListener('close', () => { persist(); tool.setAttribute('aria-expanded', 'false'); });",
    "  dialog.addEventListener('close', () => {\n    persist();\n    if (dialog.open) return;\n    resetPcPlacement(); tool.setAttribute('aria-expanded', 'false');\n  });");
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>!/\bsrc\s*=/i.test(m[1]));
  const hashes=scripts.map(m=>{
    const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:m[2],encoding:'utf8'});
    if(checked.status!==0)throw new Error('構文確認に失敗しました。未変更です。\n'+checked.stderr);
    return "'sha256-"+crypto.createHash('sha256').update(m[2]).digest('base64')+"'";
  });
  const meta=html.match(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>/i)?.[0];
  if(!meta||!/script-src\s+[^;]+;/.test(meta))throw new Error('CSPが見つかりません。未変更です。');
  const updated=meta.replace(/(script-src\s+)([^;]+)(;)/,(_all,prefix,value,suffix)=>
    prefix+value.replace(/\s*'sha256-[^']+'/g,'').trim()+' '+[...new Set(hashes)].join(' ')+suffix);
  return once(html,meta,updated);
}
function install(file='index.html') {
  const target=path.resolve(file);
  const original=fs.readFileSync(target,'utf8');
  const updated=patchIndex(original);
  const backup=fs.mkdtempSync(path.join(os.tmpdir(),'submovie-danmaku-pc-backup-'));
  const backupFile=path.join(backup,'index.html');
  fs.copyFileSync(target,backupFile);
  try{fs.writeFileSync(target,updated,'utf8');}
  catch(error){fs.copyFileSync(backupFile,target);throw error;}
  console.log('PC版の弾幕設定を更新しました: '+target);
  console.log('元ファイルのバックアップ: '+backupFile);
  console.log('Firebaseの再デプロイは不要です。index.html をコミット・プッシュしてください。');
}
if(require.main===module){try{install(process.argv[2]);}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={patchIndex,install};
