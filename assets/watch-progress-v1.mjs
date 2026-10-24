import {t,th,locale} from './site-language-v1.mjs?v=20261024-1';
// Watch positions stay in this browser and are separated by signed-in account.
export function validVideoId(value) {
  return typeof value === 'string' && value.startsWith('videos/') && value.length > 7
    && value.length <= 1024 && !/[\x00-\x1f\x7f]/.test(value)
    && !value.split('/').some(part => part === '.' || part === '..');
}

export function normalizeProgress(value, now = Date.now()) {
  const records = new Map();
  for (const row of (Array.isArray(value) ? value.slice(0, 1000) : [])) {
    if (!row || !validVideoId(row.id) || !Number.isFinite(row.position)
        || !Number.isFinite(row.duration) || !Number.isFinite(row.at)
        || row.duration <= 0 || row.duration > 604800 || row.position < 0
        || row.position > row.duration || row.at > now + 60000
        || row.at < now - 365 * 86400000) continue;
    if (!records.has(row.id) || records.get(row.id).at < row.at) {
      records.set(row.id, {id: row.id, position: row.position, duration: row.duration, at: row.at});
    }
  }
  return new Map([...records].sort((a, b) => b[1].at - a[1].at).slice(0, 500));
}

export function followingOrder(videos, subscriptions, seed) {
  const followed = new Set(subscriptions), groups = new Map(), seen = new Set();
  const hash = value => {
    let h = Number(seed) >>> 0;
    for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
    return (h ^ (h >>> 15)) >>> 0;
  };
  for (const video of videos) {
    const id = video.itemRef?.fullPath;
    if (!validVideoId(id) || seen.has(id) || !followed.has(video.uploaderUid)) continue;
    seen.add(id);
    if (!groups.has(video.uploaderUid)) groups.set(video.uploaderUid, []);
    groups.get(video.uploaderUid).push(video);
  }
  const channels = [...groups.keys()].sort((a, b) => hash(a) - hash(b) || a.localeCompare(b));
  for (const rows of groups.values()) rows.sort((a, b) => hash(a.itemRef.fullPath) - hash(b.itemRef.fullPath) || a.itemRef.fullPath.localeCompare(b.itemRef.fullPath));
  const result = [];
  for (let index = 0; result.length < seen.size; index++) {
    for (const channel of channels) if (groups.get(channel)[index]) result.push(groups.get(channel)[index]);
  }
  return result;
}

export function mountWatchProgress({video, user, onAuth, storage = null}) {
  if (!storage) { try { storage = window.localStorage; } catch { /* disabled browser storage */ } }
  let owner = '', records = new Map(), selected = '', ready = false, engaged = false, lastSave = 0;
  const key = () => 'submovie_watch_progress_v1:' + (owner || 'guest');
  function restore() {
    try { records = normalizeProgress(JSON.parse(storage?.getItem(key()) || '[]')); }
    catch { records = new Map(); }
  }
  function paint(frame) {
    const row = records.get(frame.dataset.watchProgress);
    let bar = frame.querySelector(':scope > .watch-progress');
    if (!row || row.position <= 0) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement('span'); bar.className = 'watch-progress';
      bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-label', t("視聴済みの位置"));
      bar.append(document.createElement('span')); frame.append(bar);
    }
    const percent = Math.max(0, Math.min(100, row.position / row.duration * 100));
    bar.setAttribute('aria-valuenow', String(Math.round(percent)));
    bar.firstElementChild.style.width = percent + '%';
  }
  function refresh() { document.querySelectorAll('[data-watch-progress]').forEach(paint); }
  function flush(force = true) {
    if (!selected || !ready || !engaged || !Number.isFinite(video.duration)
        || video.duration <= 0 || video.duration > 604800 || !Number.isFinite(video.currentTime)
        || (video.currentTime < 1 && !video.ended) || (!force && Date.now() - lastSave < 5000)) return;
    const position = video.ended ? video.duration : Math.min(video.duration, Math.max(0, video.currentTime));
    records.set(selected, {id: selected, position, duration: video.duration, at: Date.now()});
    records = normalizeProgress([...records.values()]); lastSave = Date.now();
    try { storage?.setItem(key(), JSON.stringify([...records.values()])); } catch { /* memory-only fallback */ }
    refresh();
  }
  function start(id) {
    flush(); selected = validVideoId(id) ? id : ''; ready = false; engaged = false; lastSave = 0;
  }
  function stop() { flush(); selected = ''; ready = false; engaged = false; }
  function decorate(card, id) {
    if (!validVideoId(id)) return;
    const thumbnail = card.querySelector('.thumbnail-img'); if (!thumbnail) return;
    let frame = thumbnail.closest('a.video-page-link');
    if (!frame) {
      frame = thumbnail.parentElement?.classList.contains('watch-thumbnail') ? thumbnail.parentElement : document.createElement('span');
      if (!frame.parentNode) { thumbnail.replaceWith(frame); frame.append(thumbnail); }
    }
    frame.classList.add('watch-thumbnail'); frame.dataset.watchProgress = id; paint(frame);
  }
  video.addEventListener('loadedmetadata', () => { ready = true; });
  video.addEventListener('emptied', () => { ready = false; });
  video.addEventListener('playing', () => { engaged = true; });
  video.addEventListener('seeked', () => { if (ready && video.currentTime >= 1) engaged = true; flush(); });
  video.addEventListener('timeupdate', () => flush(false));
  for (const event of ['pause', 'ended']) video.addEventListener(event, () => flush());
  window.addEventListener('pagehide', () => flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('storage', event => { if (event.key === key()) { restore(); refresh(); } });
  onAuth(() => {
    const next = user()?.uid || '';
    if (next === owner) return;
    flush(); owner = next; ready = false; engaged = false; restore(); refresh();
  });
  owner = user()?.uid || ''; restore();
  return {start, stop, flush, decorate, refresh};
}
