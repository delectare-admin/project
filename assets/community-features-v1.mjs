import {t,th,locale} from './site-language-v1.mjs?v=20261024-1';
import {safeHttps, formatCount} from './creator-lab-model-v1.mjs?v=20261024-language1';
import {createUiIcon} from './ui-icons-v1.mjs?v=20261022';

const el = (tag, css, text) => {
  const node = document.createElement(tag); if (css) node.className = css;
  if (text !== undefined) node.textContent = text; return node;
};
function avatar(profile, css = 'community-avatar') {
  const node = el('span', css, (profile.channelName || 'ユーザー').slice(0, 1));
  const url = safeHttps(profile.avatarUrl);
  if (url) {
    const image = el('img'); image.src = url; image.alt = ''; image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer'; image.addEventListener('error', () => image.remove(), {once: true});
    node.append(image);
  }
  return node;
}

export async function mountRecentSubscribers(a, host, current) {
  host.append(el('h2', '', t("最近のチャンネル登録者")), el('p', 'yl-muted', t("過去90日間・表示を許可した人のみ")));
  const list = el('div', 'yl-subscriber-list'), status = el('p', 'yl-status', t("読み込み中…"));
  status.setAttribute('role', 'status');
  const more = el('button', 'yl-button', t("さらに表示")); more.type = 'button'; more.hidden = true;
  host.append(list, status, more); let cursor = null, busy = false;
  async function load() {
    if (busy || !current()) return; busy = true; more.disabled = true;
    try {
      const result = await a.api({op: 'recentSubscribers', cursor});
      if (!current()) return;
      for (const profile of result.subscribers || []) {
        const row = el('button', 'yl-subscriber-row'); row.type = 'button';
        const detail = el('span', 'yl-subscriber-detail');
        detail.append(el('strong', '', profile.channelName), el('small', 'yl-muted', t("チャンネル登録者 ") + formatCount(profile.subscriberCount) + (locale==='ja-JP'?'人':'')));
        row.append(avatar(profile), detail); row.title = profile.channelName;
        row.addEventListener('click', () => { if (current()) a.openChannel(profile.uid); }); list.append(row);
      }
      cursor = result.next || null; more.hidden = !cursor;
      status.textContent = list.childElementCount ? '' : t("表示できる最近の登録者はまだいません。");
    } catch (error) {
      if (current()) { status.textContent = error.message || t("登録者を読み込めませんでした。"); status.dataset.error = 'true'; more.hidden = false; more.textContent = t("もう一度読み込む"); }
    } finally { busy = false; more.disabled = false; }
  }
  more.addEventListener('click', load); await load();
}

export function mountCommunityFeatures(a) {
  const pendingHearts = new Map(), nodes = new WeakMap(); let account = '', epoch = 0, syncing = null;
  const user = () => a.user();
  const heartKey = comment => a.currentVideoId() + '\n' + comment.id;
  function paintHeart(host) {
    const record = nodes.get(host); if (!record) return;
    const {comment, videoId} = record, owner = a.creatorUid(), me = user();
    if (videoId !== a.currentVideoId()) return;
    const key = videoId + '\n' + comment.id, pending = pendingHearts.get(key);
    if (pending && !pending.busy && comment.creatorHeart === pending.value) pendingHearts.delete(key);
    const state = pendingHearts.get(key), active = state ? state.value : comment.creatorHeart === true;
    const canHeart = !!me && me.uid === owner && !comment.pending;
    host.replaceChildren(); if (!active && !canHeart) return;
    const button = el(canHeart ? 'button' : 'span', 'creator-comment-heart' + (active ? ' is-hearted' : ''));
    if (canHeart) { button.type = 'button'; button.disabled = !!state?.busy; button.setAttribute('aria-pressed', String(active)); }
    button.setAttribute('aria-label', canHeart ? active ? t("投稿者のハートを取り消す") : t("投稿者としてハートを付ける") : t("投稿者からハート"));
    button.title = button.getAttribute('aria-label');
    if (active) {
      const face = avatar({channelName: a.creatorName()}, 'creator-heart-avatar'); button.append(face);
      a.profile(owner).then(profile => {
        if (button.isConnected && videoId === a.currentVideoId()) face.replaceWith(avatar(profile, 'creator-heart-avatar'));
      }).catch(() => {});
    }
    button.append(createUiIcon('heart')); host.append(button);
    if (canHeart) button.addEventListener('click', async event => {
      event.stopPropagation(); if (pendingHearts.get(key)?.busy) return;
      host.parentElement?.querySelector('.community-action-error')?.remove();
      const uid = user()?.uid, token = epoch;
      if (!uid || uid !== a.creatorUid() || videoId !== a.currentVideoId()) return;
      const operation = {value: !active, busy: true}; pendingHearts.set(key, operation); paintAll();
      try {
        await a.api({op: 'moderate', videoId, commentId: comment.id, mode: 'heart', value: operation.value});
        if (epoch !== token || user()?.uid !== uid || a.currentVideoId() !== videoId) return;
        operation.busy = false; comment.creatorHeart = operation.value;
        if (pendingHearts.size > 100) for (const [id, value] of pendingHearts) { if (!value.busy && id !== key) { pendingHearts.delete(id); break; } }
      } catch (error) {
        if (epoch !== token || user()?.uid !== uid || a.currentVideoId() !== videoId) return;
        pendingHearts.delete(key);
        const notice = el('span', 'community-action-error', error.message || t("ハートを保存できませんでした。"));
        notice.setAttribute('role', 'alert'); host.after(notice);
      } finally { if (epoch === token) paintAll(); }
    });
  }
  function paintAll() { document.querySelectorAll('.creator-heart-host').forEach(paintHeart); }
  function decorateComment(node, comment) {
    const actions = node.querySelector('.comment-actions-bar'); if (!actions) return;
    const host = el('span', 'creator-heart-host');
    nodes.set(host, {comment, videoId: a.currentVideoId()});
    const reply = actions.querySelector('.reply-toggle-btn');
    if (reply) actions.insertBefore(host, reply); else actions.append(host);
    paintHeart(host);
  }

  const panel = document.getElementById('mySettingsDialog');
  let checkbox, status, section;
  if (panel) {
    section = el('section', 'community-subscriber-setting'); section.hidden = true;
    section.append(el('h3', '', t("登録先への表示")));
    const label = el('label', 'yl-check'); checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.disabled = true;
    label.append(checkbox, el('span', '', t("登録先の投稿者に、自分のチャンネル名とアイコンを表示する")));
    status = el('p', 'yl-status'); status.setAttribute('role', 'status');
    section.append(label, el('p', 'yl-muted', t("初期設定はオフです。オンにすると登録先の「最近のチャンネル登録者」に表示されます。メールアドレスや登録先一覧は表示されません。")), status);
    panel.append(section);
  }
  async function syncCards(token = epoch) {
    if (syncing?.token === token || !user()) return;
    const operation = {token}; syncing = operation; let cursor = null;
    try {
      do {
        if (token !== epoch || !user()) return;
        const result = await a.api({op: 'syncSubscriberCards', cursor}); cursor = result.next || null;
      } while (cursor);
    } finally { if (syncing === operation) syncing = null; }
  }
  async function refreshSetting() {
    if (!checkbox) return;
    const token = epoch; checkbox.disabled = true; section.hidden = !user(); if (!user()) return;
    try {
      const result = await a.api({op: 'subscriberVisibility'});
      if (token !== epoch) return;
      checkbox.checked = result.visible === true; checkbox.disabled = false; status.textContent = '';
      if (result.visible === true) await syncCards(token);
    } catch (error) { if (token === epoch) status.textContent = error.message || t("表示設定を読み込めませんでした。"); }
  }
  checkbox?.addEventListener('change', async () => {
    const token = epoch, desired = checkbox.checked; let saved = false; checkbox.disabled = true;
    status.textContent = t("保存中…");
    try {
      const result = await a.api({op: 'subscriberVisibility', visible: desired});
      if (token !== epoch) return;
      saved = true; checkbox.checked = result.visible === true; status.textContent = t("設定を保存しました。");
      await syncCards(token);
    } catch (error) {
      if (token === epoch) {
        if (!saved) await refreshSetting();
        if (token === epoch) status.textContent = saved
          ? t("表示設定は保存しました。一覧への反映は、設定を開き直して再試行してください。")
          : error.message || t("設定を保存できませんでした。");
      }
    } finally { if (token === epoch) checkbox.disabled = false; }
  });
  document.getElementById('mySettingsBtn')?.addEventListener('click', refreshSetting);
  document.addEventListener('submovie-subscription-change', event => {
    if (!user() || typeof event.detail?.channelUid !== 'string') return;
    void a.api({op: 'syncSubscriberCard', channelUid: event.detail.channelUid}).catch(() => {});
  });
  a.onAuth(() => {
    const next = user()?.uid || ''; if (next !== account) { account = next; epoch++; pendingHearts.clear(); if (checkbox) { checkbox.checked = false; checkbox.disabled = true; status.textContent = ''; section.hidden = !next; } paintAll(); }
  });
  // Login completion has loaded the site's existing private subscription state.
  document.addEventListener('submovie-account-ready', () => { if (user()) void refreshSetting(); });
  return {decorateComment, videoChanged() { pendingHearts.clear(); }};
}
