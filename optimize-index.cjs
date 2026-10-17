// Node.js の標準機能だけを使います。ネット通信・Firebaseへの書き込みはしません。
// 実行: node optimize-index.cjs [index.htmlへのパス]
// 元ファイルを残し、隣に index.optimized.html を作ります。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const inputPath = path.resolve(process.argv[2] || 'index.html');
const outputPath = path.join(path.dirname(inputPath), 'index.optimized.html');

function optimize(source) {
  let html = source.replace(/\r\n?/g, '\n');
  function replaceOnce(before, after) {
    if (html.split(before).length !== 2) {
      throw new Error('対象のコードが一致しません。ファイルは変更していません。対象: ' + before.slice(0, 85));
    }
    html = html.replace(before, () => after);
  }

  // 見ない先の動画を大量に先読みしない。低い画質から再生を開始する。
  replaceOnce(`    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    backBufferLength: 30,
    startFragPrefetch: true`, `    maxBufferLength: 15,
    maxMaxBufferLength: 30,
    backBufferLength: 15,
    maxBufferSize: 12 * 1000 * 1000,
    startFragPrefetch: false,
    startLevel: 0`);

  // 自動画質はスマホ/データセーバーで360p、PCで720pを目安に抑える。
  // 各画質の実ファイルが必要。画質の手動選択は従来どおり利用できる。
  replaceOnce('  player.on(window.Hls.Events.MANIFEST_PARSED, play);', `  player.on(window.Hls.Events.MANIFEST_PARSED, () => {
    if (thisPlayback !== playbackGeneration) return;
    const compact = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
    const heightLimit = compact || navigator.connection?.saveData ? 360 : 720;
    // HLSは帯域順のレベル番号で上限を指定する。先頭から上限内の範囲を使う。
    // 低画質がない場合は最小帯域のレベルを使い、存在しない画質は生成しない。
    let cap = 0;
    for (let i = 0; i < player.levels.length; i++) {
      const height = player.levels[i].height;
      if (!Number.isFinite(height) || height <= 0 || height > heightLimit) break;
      cap = i;
    }
    if (player.levels.length) player.autoLevelCapping = cap;
    play();
  });`);

  // 設定画面に、自動画質の実際の上限を表示する。
  replaceOnce("      quality.add(new Option('自動', '-1'));", `      const autoHeight = levels[player.autoLevelCapping]?.height;
      quality.add(new Option(autoHeight ? \`自動（最大\${autoHeight}p）\` : '自動', '-1'));`);

  // 通常のホーム移動など、再生を終了したときはコメントの購読も終了する。
  // 再生を続ける各種PiPは stopMainPlayback を呼ばない既存の動作を保つ。
  replaceOnce(`  playbackGeneration++;

  // エラー時に元の動画へ戻す処理を解除`, `  playbackGeneration++;
  if (unsubscribeComments) {
    unsubscribeComments();
    unsubscribeComments = null;
  }

  // エラー時に元の動画へ戻す処理を解除`);

  // 弾幕を一度だけ時刻順に整理し、毎フレームは表示時刻の範囲だけ調べる。
  replaceOnce('const DANMAKU_SECONDS = 5;', `const DANMAKU_SECONDS = 5;
let indexedDanmakuSource = null;
let indexedDanmaku = [];

function activeDanmakuAt(currentTime) {
  if (!Number.isFinite(currentTime)) return [];
  // コメント購読側は更新ごとに新しい配列を作る。
  if (indexedDanmakuSource !== videoComments) {
    indexedDanmakuSource = videoComments;
    indexedDanmaku = videoComments.filter(comment =>
      comment.id && typeof comment.videoTime === 'number' &&
      Number.isFinite(comment.videoTime)
    ).sort((a, b) => a.videoTime - b.videoTime);
  }
  function upperBound(time) {
    let left = 0;
    let right = indexedDanmaku.length;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (indexedDanmaku[middle].videoTime <= time) left = middle + 1;
      else right = middle;
    }
    return left;
  }
  return indexedDanmaku.slice(
    upperBound(currentTime - DANMAKU_SECONDS), upperBound(currentTime)
  );
}`);
  replaceOnce('  for (const comment of videoComments) {',
    '  for (const comment of activeDanmakuAt(currentTime)) {');
  replaceOnce(`    node.textContent = comment.text || '';`, `    const text = comment.text || '';
    if (node.textContent !== text) node.textContent = text;`);

  // 弾幕オフの間は、見えない文字を描画しない。
  replaceOnce(`  if (!videoFeatureEnabled('danmaku')) {
    if (danmakuNodes.size) {`, `  if (!videoFeatureEnabled('danmaku') || danmakuContainer.style.visibility === 'hidden') {
    if (danmakuNodes.size) {`);

  // JavaScriptの変更に合わせて既存CSPのハッシュを更新。保護を無効化しない。
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(match => !/\bsrc\s*=/i.test(match[1]));
  if (!scripts.length) throw new Error('script が見つかりません。');
  const hashes = scripts.map(match => {
    const checked = spawnSync(process.execPath, ['--check', '--input-type=module'],
      { input: match[2], encoding: 'utf8' });
    if (checked.status !== 0) throw new Error(checked.stderr || '構文確認に失敗しました。');
    return "'sha256-" + crypto.createHash('sha256').update(match[2]).digest('base64') + "'";
  });
  const cspMeta = html.match(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>/i)?.[0];
  if (!cspMeta || !/script-src\s+[^;]+;/.test(cspMeta)) {
    throw new Error('既存のCSPが見つかりません。ファイルは変更していません。');
  }
  const updatedMeta = cspMeta.replace(/(script-src\s+)([^;]+)(;)/,
    (_all, prefix, value, suffix) => prefix + value.replace(/\s*'sha256-[^']+'/g, '').trim() +
      ' ' + [...new Set(hashes)].join(' ') + suffix);
  replaceOnce(cspMeta, updatedMeta);
  return html;
}

if (require.main === module) {
  try {
    if (inputPath === outputPath) throw new Error('入力には元の index.html を指定してください。');
    if (fs.existsSync(outputPath)) throw new Error('index.optimized.html が既にあります。別名で退避してから実行してください。');
    const output = optimize(fs.readFileSync(inputPath, 'utf8'));
    fs.writeFileSync(outputPath, output, { flag: 'wx' });
    console.log('作成しました: ' + outputPath);
    console.log('元ファイルは変更していません。確認後、公開用の index.html と差し替えてください。');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { optimize };
