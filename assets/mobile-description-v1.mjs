// Reuse the existing description sheet and counters; no Firebase or network API calls.
const make = (tag, css, text) => {
  const node = document.createElement(tag);
  if (css) node.className = css;
  if (text !== undefined) node.textContent = text;
  return node;
};
const cleanCount = text => {
  const value = String(text || '').replace(/\s*回視聴\s*$/, '').trim();
  return /^[\d,，]+$/.test(value) ? value : '—';
};
function enhance(sheet) {
  if (sheet.classList.contains('md-enhanced')) return;
  const title = sheet.querySelector('#mobileDescriptionTitle');
  const meta = sheet.querySelector('#mobileDescriptionMeta');
  const description = sheet.querySelector('#mobileDescriptionBody');
  const views = meta?.querySelector('.sheet-description-views');
  const date = meta?.querySelector('.sheet-description-date');
  const danmaku = meta?.querySelector('.watch-danmaku-stat');
  const count = danmaku?.querySelector('[data-watch-danmaku-count]');
  const sourceName = document.getElementById('uploaderName');
  const sourceAvatar = document.getElementById('uploaderAvatar');
  if (!title || !meta || !description || !views || !date || !danmaku || !count) return;

  const channel = make('button', 'md-channel'); channel.type = 'button';
  const face = make('span', 'md-avatar'); face.setAttribute('aria-hidden', 'true');
  const name = make('span', 'md-channel-name'); channel.append(face, name); title.after(channel);
  channel.addEventListener('click', () => {
    if (!sourceName?.dataset.uid) return;
    if (sheet.open) sheet.close();
    sourceName.click(); // Keep the site's existing channel navigation and playback cleanup.
  });
  const viewCell = make('div', 'md-stat');
  const viewValue = make('strong', 'md-stat-value', '—');
  views.hidden = true; views.setAttribute('aria-hidden', 'true');
  viewCell.append(views, viewValue, make('span', 'md-stat-label', '視聴回数'));
  const dateCell = make('div', 'md-stat md-date');
  const day = make('strong', 'md-stat-value', '—');
  const year = make('span', 'md-stat-label', '投稿日不明');
  date.hidden = true; date.setAttribute('aria-hidden', 'true'); dateCell.append(date, day, year);
  danmaku.classList.add('md-stat'); count.classList.add('md-stat-value');
  danmaku.append(make('span', 'md-stat-label', '弾幕数'));
  meta.replaceChildren(danmaku, viewCell, dateCell);
  sheet.classList.add('md-enhanced');

  let avatarKey = null;
  function syncChannel() {
    const label = sourceName?.textContent.trim() || '投稿者'; name.textContent = label;
    channel.disabled = !sourceName?.dataset.uid; channel.setAttribute('aria-label', label + 'のチャンネルを表示');
    const background = sourceAvatar?.style.backgroundImage || '';
    const key = label + '\n' + background;
    if (key === avatarKey) return; avatarKey = key; face.replaceChildren(document.createTextNode(label.slice(0, 1)));
    const match = /^url\(["']?(.*?)["']?\)$/.exec(background);
    if (!match) return;
    try {
      const url = new URL(match[1]);
      if (url.protocol !== 'https:' || url.username || url.password) return;
      const image = make('img'); image.alt = ''; image.referrerPolicy = 'no-referrer'; image.src = url.href;
      image.addEventListener('error', () => image.remove(), {once: true}); face.append(image);
    } catch { /* Keep the initial if the existing avatar URL is unusable. */ }
  }
  function syncStats() {
    viewValue.textContent = cleanCount(views.textContent);
    const match = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s*投稿)?$/.exec(date.textContent.trim());
    let valid = false;
    if (match) {
      const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
      const test = new Date(Date.UTC(y, m - 1, d));
      valid = y >= 1970 && test.getUTCFullYear() === y && test.getUTCMonth() === m - 1 && test.getUTCDate() === d;
      if (valid) { day.textContent = `${m}月${d}日`; year.textContent = `${y}年`; }
    }
    if (!valid) { day.textContent = '—'; year.textContent = '投稿日不明'; }
    dateCell.setAttribute('aria-label', valid ? '投稿日：' + date.textContent.trim().replace(/\s*投稿$/, '') : '投稿日不明');
  }
  for (const source of [views, date]) new MutationObserver(syncStats).observe(source, {childList: true, subtree: true, characterData: true});
  for (const source of [sourceName, sourceAvatar]) if (source) new MutationObserver(syncChannel).observe(source, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'data-uid']});
  new MutationObserver(() => { if (sheet.open) { syncStats(); syncChannel(); } }).observe(sheet, {attributes: true, attributeFilter: ['open']});
  syncStats(); syncChannel();
}
function start() {
  const existing = document.getElementById('mobileDescriptionSheet');
  if (existing) { enhance(existing); return; }
  const observer = new MutationObserver(() => {
    const sheet = document.getElementById('mobileDescriptionSheet');
    if (sheet) { observer.disconnect(); enhance(sheet); }
  });
  observer.observe(document.body, {childList: true});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
else start();
