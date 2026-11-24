// Notification panel v1: safe DOM rendering, YouTube-like PC positioning,
// 3-column notification items, in-panel comment viewer, and direct SPA navigation.

const LOGO_FALLBACK_URL = './logo.png';
const META_CACHE_TTL_MS = 60 * 1000;
const MAX_CONCURRENT_META_FETCHES = 4;
const MAX_PANEL_COMMENTS = 80;

function hasControlChars(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

/**
 * Validates an image URL strictly: allows only https:/http: URLs without credentials,
 * or safe relative paths inside this site (e.g. ./logo.png). Blocks javascript:, data:, etc.
 */
export function safeImageUrl(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 4096 || hasControlChars(trimmed)) return '';

  // Block explicit dangerous schemes before URL parsing
  if (/^(?:javascript|vbscript|data|file|blob):/i.test(trimmed)) return '';

  const isRelative =
    trimmed.startsWith('./') ||
    (trimmed.startsWith('/') && !trimmed.startsWith('//')) ||
    /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(trimmed);

  try {
    const parsed = isRelative
      ? new URL(trimmed, window.location.href)
      : new URL(trimmed);

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (parsed.username || parsed.password) return '';

    if (isRelative) {
      if (parsed.origin !== window.location.origin) return '';
      if (trimmed.split('/').some(seg => seg === '..')) return '';
    }

    return parsed.href;
  } catch {
    return '';
  }
}

function safeUid(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 128 ||
    trimmed.includes('/') ||
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    hasControlChars(trimmed)
  ) {
    return '';
  }
  return trimmed;
}

function safeVideoHref(videoId, validVideoPath) {
  if (!validVideoPath(videoId)) return '';
  try {
    const url = new URL(window.location.pathname, window.location.origin);
    url.search = '';
    url.hash = '';
    url.searchParams.set('v', videoId);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (url.origin !== window.location.origin) return '';
    return url.pathname + url.search;
  } catch {
    return '';
  }
}

function formatNotificationDate(timestamp, locale, t) {
  const date = timestamp?.toDate?.();
  if (!date || Number.isNaN(date.getTime())) return '';
  return t('記録日時：{0}', date.toLocaleString(locale));
}

function formatCommentDate(timestamp, locale) {
  const ms = timestamp?.toMillis?.();
  if (!Number.isFinite(ms)) return '';
  try {
    return new Date(ms).toLocaleDateString(locale);
  } catch {
    return '';
  }
}

export function mountNotificationPanel(deps) {
  const {
    auth,
    db,
    storage,
    header,
    homeScreen,
    getCurrentFeed,
    getCurrentUser,
    getCurrentVideoId,
    getAllVideos,
    mergeVideoEntries,
    videoFromMetadata,
    parseVideoInteractionSettings,
    getHomeProfile,
    getBlockedUids,
    isMutedComment,
    normalizeText,
    validVideoPath,
    validCommentImagePath,
    watchVideo,
    showMyProfile,
    t,
    locale,
    createUiIcon,
    // Firebase SDK helpers passed from index.html
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    updateDoc,
    onAuthStateChanged,
    storageRef,
    getMetadata,
    getDownloadURL
  } = deps;

  if (!header || document.getElementById('notificationBell')) return null;

  const bell = document.createElement('button');
  bell.id = 'notificationBell';
  bell.type = 'button';
  bell.hidden = true;
  bell.setAttribute('aria-label', t('通知を開く'));
  bell.setAttribute('aria-haspopup', 'dialog');
  bell.setAttribute('aria-expanded', 'false');
  bell.appendChild(createUiIcon('bell'));

  const searchBtn = document.getElementById('mobileWatchSearchBtn');
  const settingsBtn = document.getElementById('mySettingsBtn');
  const headerUserInfo = document.getElementById('userInfo');
  const headerActions = header.querySelector('.header-actions');
  const mobileQuery = window.matchMedia('(max-width: 768px)');

  function placeNotificationBell() {
    if (mobileQuery.matches) {
      if (searchBtn) {
        header.insertBefore(bell, searchBtn);
        if (settingsBtn) searchBtn.after(settingsBtn);
      } else {
        header.appendChild(bell);
      }
    } else {
      if (headerUserInfo && headerActions?.contains(headerUserInfo)) {
        headerActions.insertBefore(bell, headerUserInfo);
      } else if (headerActions) {
        headerActions.appendChild(bell);
      } else {
        header.appendChild(bell);
      }
    }
  }

  placeNotificationBell();

  // Build <dialog id="notificationPanel"> entirely with DOM APIs (no innerHTML)
  const panel = document.createElement('dialog');
  panel.id = 'notificationPanel';
  panel.setAttribute('aria-labelledby', 'notificationHeading');

  const headingBar = document.createElement('div');
  headingBar.className = 'notification-heading';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.id = 'notificationBack';
  backBtn.hidden = true;
  backBtn.setAttribute('aria-label', t('通知一覧に戻る'));
  backBtn.appendChild(createUiIcon('back'));

  const headingTitle = document.createElement('h2');
  headingTitle.id = 'notificationHeading';
  headingTitle.textContent = t('通知');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'notificationClose';
  closeBtn.setAttribute('aria-label', t('通知を閉じる'));
  closeBtn.appendChild(createUiIcon('close'));

  headingBar.append(backBtn, headingTitle, closeBtn);

  const body = document.createElement('div');
  body.className = 'notification-body';

  const listView = document.createElement('div');
  listView.id = 'notificationListView';

  const statusEl = document.createElement('div');
  statusEl.id = 'notificationStatus';
  statusEl.textContent = t('読み込み中…');

  const listEl = document.createElement('div');
  listEl.id = 'notificationList';

  listView.append(statusEl, listEl);

  const commentsView = document.createElement('div');
  commentsView.id = 'notificationCommentsView';
  commentsView.hidden = true;

  body.append(listView, commentsView);
  panel.append(headingBar, body);
  document.body.appendChild(panel);

  let uid = null;
  let unsubscribe = null;
  let currentView = 'list'; // 'list' | 'comments'
  let savedListScrollTop = 0;
  let listRenderEpoch = 0;
  let detailEpoch = 0;
  let commentsIndexReadyPromise = null;

  // Bounded caches for video metadata and comment images
  const videoMetaCache = new Map();
  const commentImageUrlCache = new Map();
  let activeMetaFetches = 0;
  const metaFetchQueue = [];

  function runQueuedMetaFetch(task) {
    return new Promise((resolve, reject) => {
      const execute = () => {
        activeMetaFetches++;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            activeMetaFetches--;
            const next = metaFetchQueue.shift();
            if (next) next();
          });
      };
      if (activeMetaFetches < MAX_CONCURRENT_META_FETCHES) execute();
      else metaFetchQueue.push(execute);
    });
  }

  function findCachedCatalogVideo(videoId) {
    const videos = getAllVideos();
    return videos.find(v => v?.itemRef?.fullPath === videoId) || null;
  }

  /**
   * Resolves a video's metadata safely. Returns:
   *  { status: 'ok', video, freshMetadata }
   *  { status: 'deleted' }
   *  { status: 'error' }
   */
  async function resolveVideoMetadata(videoId, { forceFresh = false } = {}) {
    if (!validVideoPath(videoId)) return { status: 'deleted' };

    const now = Date.now();
    const cached = videoMetaCache.get(videoId);
    if (!forceFresh && cached && now - cached.at < META_CACHE_TTL_MS) {
      return cached.promise;
    }

    if (!forceFresh) {
      const fromCatalog = findCachedCatalogVideo(videoId);
      if (fromCatalog && fromCatalog.thumbUrl) {
        const result = { status: 'ok', video: fromCatalog, freshMetadata: null };
        videoMetaCache.set(videoId, { at: now, promise: Promise.resolve(result) });
        return result;
      }
    }

    if (videoMetaCache.size >= 150) {
      videoMetaCache.delete(videoMetaCache.keys().next().value);
    }

    const promise = runQueuedMetaFetch(async () => {
      try {
        const itemRef = storageRef(storage, videoId);
        const metadata = await getMetadata(itemRef);
        const video = videoFromMetadata(itemRef, metadata);
        video.freshMetadata = metadata;
        return { status: 'ok', video, freshMetadata: metadata };
      } catch (error) {
        if (error?.code === 'storage/object-not-found') {
          return { status: 'deleted' };
        }
        return { status: 'error' };
      }
    });

    const record = { at: now, promise };
    videoMetaCache.set(videoId, record);
    promise.then(res => {
      if (res.status === 'error' && videoMetaCache.get(videoId) === record) {
        videoMetaCache.delete(videoId);
      }
    });
    return promise;
  }

  function isCommentsIndexReady() {
    if (!commentsIndexReadyPromise) {
      commentsIndexReadyPromise = getDoc(doc(db, 'performanceStatus', 'comments'))
        .then(snap => snap.exists() && snap.data()?.ready === true)
        .catch(() => false);
    }
    return commentsIndexReadyPromise;
  }

  function buildMessage(data) {
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }
    if (data.kind === 'comment') {
      const author = typeof data.actorName === 'string' && data.actorName.trim()
        ? data.actorName.trim()
        : t('ユーザー');
      return data.title
        ? t('{0}さんが「{1}」にコメントしました', author, data.title)
        : t('{0}さんがコメントしました', author);
    }
    if (data.kind === 'reply') {
      const author = typeof data.actorName === 'string' && data.actorName.trim()
        ? data.actorName.trim()
        : t('ユーザー');
      return t('{0}さんが返信しました', author);
    }

    const number = Number(data.milestone).toLocaleString(locale);
    if (data.kind === 'subscribers') {
      return t('チャンネル登録者数が{0}人に到達しました！', number);
    }
    if (data.kind === 'danmaku') {
      return t('「{0}」の弾幕が累計{1}件に到達しました！', data.title || '', number);
    }
    return t('「{0}」の高評価が{1}件に到達しました！', data.title || '', number);
  }

  function positionPanel() {
    if (!panel.open) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bellRect = bell.getBoundingClientRect();
    const gap = 8;
    const edgeMargin = 12;

    // On desktop when there is room to the left of the bell icon, place panel beside the bell
    // aligned near the top of the header (YouTube-style).
    const availableLeft = bellRect.left - gap - edgeMargin;
    const useDesktopBeside =
      !mobileQuery.matches &&
      bellRect.width > 0 &&
      availableLeft >= 340;

    if (useDesktopBeside) {
      const width = Math.min(480, Math.floor(availableLeft));
      const right = Math.max(edgeMargin, Math.round(vw - bellRect.left + gap));
      const top = Math.max(8, Math.min(20, Math.round(bellRect.top - 4)));
      const maxHeight = Math.max(260, Math.min(640, vh - top - 16));

      panel.classList.add('notif-panel-desktop-beside');
      panel.style.setProperty('--notif-panel-top', `${top}px`);
      panel.style.setProperty('--notif-panel-right', `${right}px`);
      panel.style.setProperty('--notif-panel-width', `${width}px`);
      panel.style.setProperty('--notif-panel-max-height', `${maxHeight}px`);
    } else {
      const headerRect = header.getBoundingClientRect();
      const top = Math.max(56, Math.round(Math.max(headerRect.bottom, bellRect.bottom) + 6));
      const sideMargin = mobileQuery.matches ? 8 : 12;
      const width = Math.min(390, Math.max(260, vw - sideMargin * 2));
      const maxHeight = Math.max(220, Math.min(Math.round(vh * 0.78), vh - top - 12));

      panel.classList.remove('notif-panel-desktop-beside');
      panel.style.setProperty('--notif-panel-top', `${top}px`);
      panel.style.setProperty('--notif-panel-right', `${sideMargin}px`);
      panel.style.setProperty('--notif-panel-width', `${width}px`);
      panel.style.setProperty('--notif-panel-max-height', `${maxHeight}px`);
    }
  }

  function showListView({ restoreScroll = true } = {}) {
    detailEpoch++;
    currentView = 'list';
    panel.classList.remove('is-comments-view');
    backBtn.hidden = true;
    headingTitle.textContent = t('通知');
    listView.hidden = false;
    commentsView.hidden = true;
    commentsView.replaceChildren();
    if (restoreScroll) {
      body.scrollTop = savedListScrollTop;
    }
  }

  function closePanel() {
    if (panel.open) {
      panel.close();
    }
  }

  panel.addEventListener('close', () => {
    bell.setAttribute('aria-expanded', 'false');
    showListView({ restoreScroll: false });
  });

  // Close when clicking outside the panel (on the <dialog> backdrop)
  panel.addEventListener('click', event => {
    if (event.target !== panel) return;
    if (event.clientX === 0 && event.clientY === 0) return;
    const rect = panel.getBoundingClientRect();
    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (outside) {
      closePanel();
    }
  });

  backBtn.addEventListener('click', () => {
    showListView({ restoreScroll: true });
  });

  closeBtn.addEventListener('click', closePanel);

  function syncVisibility() {
    const signedIn =
      auth.currentUser &&
      !auth.currentUser.isAnonymous &&
      auth.currentUser.uid === uid;

    const watching = document.body.classList.contains('watch-mode');
    const onNotificationScreen =
      (
        homeScreen.style.display !== 'none' &&
        !watching &&
        ['all', 'subscriptions', 'trending', 'mypage'].includes(getCurrentFeed())
      ) ||
      (
        watching &&
        !mobileQuery.matches
      );

    bell.hidden = !signedIn || !onNotificationScreen;

    if (bell.hidden && panel.open) {
      closePanel();
    }
  }

  bell.addEventListener('click', () => {
    syncVisibility();
    if (bell.hidden) return;
    if (panel.open) {
      closePanel();
      return;
    }
    showListView({ restoreScroll: false });
    body.scrollTop = 0;
    panel.showModal();
    bell.setAttribute('aria-expanded', 'true');
    positionPanel();
  });

  function applyAvatarImage(container, url, fallbackInitial = '') {
    const safeUrl = safeImageUrl(url);
    if (safeUrl) {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        applyLogoOrInitialFallback(container, fallbackInitial);
      }, { once: true });
      img.src = safeUrl;
      container.classList.remove('is-logo-fallback');
      container.replaceChildren(img);
      return;
    }
    applyLogoOrInitialFallback(container, fallbackInitial);
  }

  function applyLogoOrInitialFallback(container, fallbackInitial = '') {
    if (fallbackInitial) {
      container.classList.remove('is-logo-fallback');
      container.replaceChildren(document.createTextNode(fallbackInitial));
      return;
    }
    const safeLogo = safeImageUrl(LOGO_FALLBACK_URL);
    if (safeLogo) {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        container.classList.remove('is-logo-fallback');
        container.replaceChildren(createUiIcon('bell'));
      }, { once: true });
      img.src = safeLogo;
      container.classList.add('is-logo-fallback');
      container.replaceChildren(img);
      return;
    }
    container.classList.remove('is-logo-fallback');
    container.replaceChildren(createUiIcon('bell'));
  }

  function applyThumbnailImage(container, thumbUrl) {
    const safeThumb = safeImageUrl(thumbUrl);
    if (!safeThumb) {
      const icon = createUiIcon('play');
      icon.classList.add('notification-thumb-placeholder');
      container.replaceChildren(icon);
      return;
    }
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      const icon = createUiIcon('play');
      icon.classList.add('notification-thumb-placeholder');
      container.replaceChildren(icon);
    }, { once: true });
    img.src = safeThumb;
    container.replaceChildren(img);
  }

  async function resolveNotificationAvatar(data, ownerUid, videoObj) {
    // 1. Direct avatar URL on notification payload (if present and safe)
    const direct = safeImageUrl(
      data.avatarUrl || data.actorAvatarUrl || data.iconUrl || ''
    );
    if (direct) return { url: direct, initial: '' };

    // 2. Actor profile (e.g., future comment/reply notifications)
    const actorUid = safeUid(data.actorUid || data.fromUid || '');
    if (actorUid) {
      try {
        const profile = await getHomeProfile(actorUid);
        const actorAvatar = safeImageUrl(profile?.avatarUrl || '');
        if (actorAvatar) return { url: actorAvatar, initial: '' };
        const name = String(profile?.channelName || data.actorName || '').trim();
        if (name) return { url: '', initial: [...name][0].toUpperCase() };
      } catch {
        // Ignore profile lookup errors and fall back cleanly
      }
    }

    // 3. Channel/uploader avatar for milestone notifications
    const targetUid = safeUid(videoObj?.uploaderUid || ownerUid);
    if (targetUid) {
      const me = getCurrentUser();
      if (me && me.uid === targetUid && safeImageUrl(me.avatarUrl)) {
        return { url: safeImageUrl(me.avatarUrl), initial: '' };
      }
      try {
        const profile = await getHomeProfile(targetUid);
        const channelAvatar = safeImageUrl(profile?.avatarUrl || '');
        if (channelAvatar) return { url: channelAvatar, initial: '' };
      } catch {
        // Fall back to site logo
      }
    }

    // 4. System / site logo fallback
    return { url: '', initial: '' };
  }

  /**
   * Direct SPA navigation to a video without full page reload or Home screen flash.
   */
  async function openVideoDirect(videoId, prefetchedVideo = null) {
    if (!validVideoPath(videoId)) return;

    let video = prefetchedVideo || findCachedCatalogVideo(videoId);
    if (!video) {
      const resolved = await resolveVideoMetadata(videoId, { forceFresh: true });
      if (resolved.status !== 'ok' || !resolved.video) {
        return;
      }
      video = resolved.video;
    }

    mergeVideoEntries([video]);
    closePanel();

    const manageScreen = document.getElementById('manageScreen');
    if (manageScreen && manageScreen.style.display !== 'none') {
      manageScreen.style.display = 'none';
    }

    const alreadyWatchingSame =
      getCurrentVideoId() === videoId &&
      document.body.classList.contains('watch-mode');

    if (alreadyWatchingSame) {
      const nextUrl = safeVideoHref(videoId, validVideoPath);
      if (nextUrl && window.location.pathname + window.location.search !== nextUrl) {
        window.history.pushState(null, '', nextUrl);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    await watchVideo(video, { updateUrl: true });
  }

  function matchesVideoMutedWords(text, mutedWords) {
    if (!Array.isArray(mutedWords) || !mutedWords.length) return false;
    const normalized = normalizeText(text);
    return mutedWords.some(word => {
      const term = normalizeText(word).trim();
      return term && normalized.includes(term);
    });
  }

  function attachSafeCommentMedia(bodyEl, comment) {
    if (!validCommentImagePath(comment.imagePath)) return;

    const link = document.createElement('a');
    link.className = 'notification-comment-media';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = t('画像を読み込み中…');
    bodyEl.appendChild(link);

    let promise = commentImageUrlCache.get(comment.imagePath);
    if (!promise) {
      promise = getDownloadURL(storageRef(storage, comment.imagePath));
      commentImageUrlCache.set(comment.imagePath, promise);
      promise.catch(() => {
        commentImageUrlCache.delete(comment.imagePath);
      });
    }

    promise.then(rawUrl => {
      if (!link.isConnected) return;
      const safeUrl = safeImageUrl(rawUrl);
      if (!safeUrl) {
        link.textContent = t('画像を表示できませんでした。');
        return;
      }
      const img = document.createElement('img');
      img.alt = t('コメントに添付された画像・GIF');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        link.removeAttribute('href');
        link.textContent = t('画像を表示できませんでした。');
      }, { once: true });
      link.href = safeUrl;
      img.src = safeUrl;
      link.replaceChildren(img);
    }).catch(() => {
      if (link.isConnected) {
        link.textContent = t('画像を取得できませんでした。');
      }
    });
  }

  function renderPanelCommentRow(comment, { isReply = false, highlighted = false, token }) {
    const row = document.createElement('div');
    row.className = 'notification-comment-row';
    if (highlighted) row.classList.add('is-highlighted');

    const authorName = String(comment.author || 'ゲスト');
    const avatar = document.createElement('div');
    avatar.className = 'notification-comment-avatar';
    if (isReply) avatar.classList.add('is-reply');
    avatar.setAttribute('aria-hidden', 'true');
    const initial = ([...authorName][0] || 'G').toUpperCase();
    avatar.textContent = initial;

    const authorUid = safeUid(comment.authorUid || '');
    if (authorUid) {
      const me = getCurrentUser();
      if (me && me.uid === authorUid && safeImageUrl(me.avatarUrl)) {
        applyAvatarImage(avatar, me.avatarUrl, initial);
      } else {
        void getHomeProfile(authorUid)
          .then(profile => {
            if (token !== detailEpoch || !avatar.isConnected) return;
            const url = safeImageUrl(profile?.avatarUrl || '');
            if (url) applyAvatarImage(avatar, url, initial);
          })
          .catch(() => {
            // Keep initial fallback
          });
      }
    }

    const content = document.createElement('div');
    content.className = 'notification-comment-body';

    const meta = document.createElement('div');
    meta.className = 'notification-comment-meta';

    const authorEl = document.createElement('span');
    authorEl.className = 'notification-comment-author';
    authorEl.textContent = authorName;

    const dateEl = document.createElement('span');
    dateEl.className = 'notification-comment-date';
    dateEl.textContent = formatCommentDate(comment.createdAt, locale);

    meta.append(authorEl, dateEl);

    const textEl = document.createElement('div');
    textEl.className = 'notification-comment-text';
    textEl.textContent = String(comment.text || '');

    content.append(meta, textEl);
    attachSafeCommentMedia(content, comment);

    const likes = Number.isSafeInteger(comment.likes) && comment.likes > 0 ? comment.likes : 0;
    if (likes > 0) {
      const likesEl = document.createElement('div');
      likesEl.className = 'notification-comment-likes';
      likesEl.append(createUiIcon('thumb-up'), document.createTextNode(likes.toLocaleString(locale)));
      content.appendChild(likesEl);
    }

    row.append(avatar, content);
    return row;
  }

  async function openCommentsView(data, ownerUid, prefetchedVideo = null) {
    const videoId = data.videoId;
    if (!validVideoPath(videoId)) return;

    const token = ++detailEpoch;
    savedListScrollTop = body.scrollTop;
    currentView = 'comments';

    panel.classList.add('is-comments-view');
    backBtn.hidden = false;
    headingTitle.textContent = t('コメント');
    listView.hidden = true;
    commentsView.hidden = false;
    commentsView.replaceChildren();
    body.scrollTop = 0;

    const initialTitle = prefetchedVideo?.title || data.title || t('動画');
    const initialThumb = safeImageUrl(
      data.thumbUrl || data.thumbnailUrl || prefetchedVideo?.thumbUrl || ''
    );
    const safeHref = safeVideoHref(videoId, validVideoPath);

    // Build video card header (clickable link to open video directly in SPA)
    const videoCard = document.createElement('a');
    videoCard.className = 'notification-video-card';
    if (safeHref) videoCard.href = safeHref;

    const cardInfo = document.createElement('div');
    cardInfo.className = 'notification-video-card-info';

    const cardTitle = document.createElement('div');
    cardTitle.className = 'notification-video-card-title';
    cardTitle.textContent = initialTitle;

    const cardSub = document.createElement('div');
    cardSub.className = 'notification-video-card-sub';
    cardSub.textContent = prefetchedVideo?.uploaderName || t('動画を開く');

    cardInfo.append(cardTitle, cardSub);

    const cardThumb = document.createElement('div');
    cardThumb.className = 'notification-video-card-thumb';
    applyThumbnailImage(cardThumb, initialThumb);

    videoCard.append(cardInfo, cardThumb);

    let resolvedVideo = prefetchedVideo;
    let videoUnavailable = false;

    videoCard.addEventListener('click', event => {
      if (videoUnavailable) {
        event.preventDefault();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      void openVideoDirect(videoId, resolvedVideo);
    });

    // Subtle notification context banner
    const banner = document.createElement('div');
    banner.className = 'notification-comments-banner';
    banner.textContent = buildMessage(data);

    const commentsStatus = document.createElement('div');
    commentsStatus.className = 'notification-comments-status';
    commentsStatus.textContent = t('コメントを読み込んでいます…');

    const commentsList = document.createElement('div');
    commentsList.className = 'notification-comments-list';

    commentsView.append(videoCard, banner, commentsStatus, commentsList);

    // Step 1: Verify video still exists and fetch fresh interaction settings
    const metaResult = await resolveVideoMetadata(videoId, { forceFresh: true });
    if (token !== detailEpoch || uid !== ownerUid) return;

    if (metaResult.status === 'deleted') {
      videoUnavailable = true;
      videoCard.classList.add('is-unavailable');
      videoCard.removeAttribute('href');
      videoCard.setAttribute('aria-disabled', 'true');
      cardSub.textContent = t('この動画は削除されたか、現在視聴できません。');
      commentsStatus.textContent = t('対象の動画は削除されているため、コメントを表示できません。');
      return;
    }

    if (metaResult.status === 'error') {
      commentsStatus.textContent = t('動画の情報を取得できませんでした。通信状態を確認してください。');
      return;
    }

    resolvedVideo = metaResult.video;
    cardTitle.textContent = resolvedVideo.title || initialTitle;
    cardSub.textContent = resolvedVideo.uploaderName
      ? `${resolvedVideo.uploaderName} · ${t('動画を開く')}`
      : t('動画を開く');
    if (resolvedVideo.thumbUrl) {
      applyThumbnailImage(cardThumb, resolvedVideo.thumbUrl);
    }

    const policy = parseVideoInteractionSettings(
      metaResult.freshMetadata?.customMetadata || resolvedVideo.originalCustomMetadata || {}
    );

    if (!policy.commentsEnabled) {
      commentsStatus.textContent = t('投稿者がコメント欄をオフにしています。');
      return;
    }

    // Step 2: Load public comments for this video safely within firestore.rules
    let rawRows = [];
    try {
      const indexReady = await isCommentsIndexReady();
      if (token !== detailEpoch || uid !== ownerUid) return;

      let snapshot;
      if (indexReady) {
        try {
          snapshot = await getDocs(
            query(
              collection(db, 'comments'),
              where('videoId', '==', videoId),
              where('type', '==', 'normal')
            )
          );
        } catch {
          snapshot = await getDocs(
            query(collection(db, 'comments'), where('videoId', '==', videoId))
          );
        }
      } else {
        snapshot = await getDocs(
          query(collection(db, 'comments'), where('videoId', '==', videoId))
        );
      }

      if (token !== detailEpoch || uid !== ownerUid) return;

      rawRows = snapshot.docs
        .map(item => ({ ...item.data(), id: item.id }))
        .filter(row => row.type !== 'danmaku');
    } catch (error) {
      if (token !== detailEpoch || uid !== ownerUid) return;
      console.warn('通知パネルのコメント取得失敗:', error?.code || 'network');
      commentsStatus.textContent = t('コメントを読み込めませんでした。');
      return;
    }

    const blockedUids = getBlockedUids();
    const visibleRows = rawRows.filter(row =>
      row.creatorHidden !== true &&
      !blockedUids.includes(row.authorUid) &&
      !matchesVideoMutedWords(row.text, policy.mutedWords) &&
      !isMutedComment(row.text)
    );

    const repliesByParent = new Map();
    for (const row of visibleRows) {
      if (row.parentId) {
        if (!repliesByParent.has(row.parentId)) repliesByParent.set(row.parentId, []);
        repliesByParent.get(row.parentId).push(row);
      }
    }
    for (const replies of repliesByParent.values()) {
      replies.sort(
        (a, b) =>
          (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0) ||
          a.id.localeCompare(b.id)
      );
    }

    const targetCommentId =
      typeof data.commentId === 'string' && data.commentId.trim()
        ? data.commentId.trim()
        : '';

    const parents = visibleRows
      .filter(row => !row.parentId)
      .sort((a, b) => {
        if (targetCommentId) {
          const aMatch =
            a.id === targetCommentId ||
            (repliesByParent.get(a.id) || []).some(r => r.id === targetCommentId);
          const bMatch =
            b.id === targetCommentId ||
            (repliesByParent.get(b.id) || []).some(r => r.id === targetCommentId);
          if (aMatch !== bMatch) return aMatch ? -1 : 1;
        }
        return (
          (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0) ||
          a.id.localeCompare(b.id)
        );
      });

    if (!parents.length) {
      commentsStatus.textContent = t('コメントはまだありません。');
      return;
    }

    commentsStatus.hidden = true;
    const fragment = document.createDocumentFragment();
    let highlightedNode = null;

    for (const parent of parents.slice(0, MAX_PANEL_COMMENTS)) {
      const thread = document.createElement('div');
      thread.className = 'notification-comment-thread';

      const isParentHighlighted = Boolean(targetCommentId && parent.id === targetCommentId);
      const parentRow = renderPanelCommentRow(parent, {
        isReply: false,
        highlighted: isParentHighlighted,
        token
      });
      if (isParentHighlighted) highlightedNode = parentRow;
      thread.appendChild(parentRow);

      const replies = repliesByParent.get(parent.id) || [];
      if (replies.length) {
        const repliesWrap = document.createElement('div');
        repliesWrap.className = 'notification-replies-wrap';

        const hasHighlightedReply = Boolean(
          targetCommentId && replies.some(r => r.id === targetCommentId)
        );

        const repliesList = document.createElement('div');
        repliesList.className = 'notification-replies-list';

        for (const reply of replies) {
          const isReplyHighlighted = Boolean(targetCommentId && reply.id === targetCommentId);
          const replyRow = renderPanelCommentRow(reply, {
            isReply: true,
            highlighted: isReplyHighlighted,
            token
          });
          if (isReplyHighlighted) highlightedNode = replyRow;
          repliesList.appendChild(replyRow);
        }

        const initiallyExpanded = hasHighlightedReply || replies.length <= 2;
        repliesList.hidden = !initiallyExpanded;

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'notification-replies-toggle';
        toggleBtn.setAttribute('aria-expanded', String(initiallyExpanded));

        const updateToggleLabel = expanded => {
          toggleBtn.textContent = expanded
            ? t('返信を非表示')
            : t('{0} 件の返信を表示', replies.length.toLocaleString(locale));
        };
        updateToggleLabel(initiallyExpanded);

        toggleBtn.addEventListener('click', () => {
          const nextExpanded = repliesList.hidden;
          repliesList.hidden = !nextExpanded;
          toggleBtn.setAttribute('aria-expanded', String(nextExpanded));
          updateToggleLabel(nextExpanded);
        });

        repliesWrap.append(toggleBtn, repliesList);
        thread.appendChild(repliesWrap);
      }

      fragment.appendChild(thread);
    }

    commentsList.appendChild(fragment);

    if (highlightedNode) {
      requestAnimationFrame(() => {
        if (highlightedNode.isConnected) {
          highlightedNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    }
  }

  onAuthStateChanged(auth, user => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    uid = user && !user.isAnonymous ? user.uid : null;
    listRenderEpoch++;
    detailEpoch++;

    listEl.replaceChildren();
    bell.classList.remove('has-unread');
    statusEl.hidden = false;
    statusEl.classList.remove('is-empty');
    statusEl.textContent = t('読み込み中…');

    if (panel.open) closePanel();
    syncVisibility();

    if (!uid) return;

    const ownerUid = uid;
    const notificationsQuery = query(
      collection(db, 'userNotifications', ownerUid, 'items'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    unsubscribe = onSnapshot(
      notificationsQuery,
      snapshot => {
        if (uid !== ownerUid) return;

        const renderToken = ++listRenderEpoch;
        listEl.replaceChildren();

        const hasUnread = snapshot.docs.some(item => item.data().read !== true);
        bell.classList.toggle('has-unread', hasUnread);
        bell.setAttribute(
          'aria-label',
          hasUnread ? t('未読の通知があります') : t('通知を開く')
        );

        statusEl.hidden = false;
        statusEl.classList.toggle('is-empty', snapshot.empty);
        statusEl.textContent = snapshot.empty
          ? t('通知はまだありません。')
          : t('最新50件まで表示します。青い通知は未読です。');

        const fragment = document.createDocumentFragment();

        for (const item of snapshot.docs) {
          const data = item.data();
          const hasVideo = validVideoPath(data.videoId);

          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'notification-item';
          button.classList.toggle('unread', data.read !== true);

          // Col 1: Left circular avatar
          const avatarEl = document.createElement('div');
          avatarEl.className = 'notification-avatar';
          avatarEl.setAttribute('aria-hidden', 'true');
          applyLogoOrInitialFallback(avatarEl);

          // Col 2: Center notification text & timestamp
          const contentEl = document.createElement('div');
          contentEl.className = 'notification-content';

          const textEl = document.createElement('span');
          textEl.className = 'notification-text';
          textEl.textContent = buildMessage(data);

          const dateEl = document.createElement('small');
          dateEl.className = 'notification-time';
          dateEl.textContent = formatNotificationDate(data.createdAt, locale, t);

          contentEl.append(textEl, dateEl);

          // Col 3: Right 16:9 video thumbnail (only for video-linked notifications)
          let thumbEl = null;
          let resolvedVideoForItem = hasVideo ? findCachedCatalogVideo(data.videoId) : null;

          if (hasVideo) {
            thumbEl = document.createElement('div');
            thumbEl.className = 'notification-thumb';
            thumbEl.setAttribute('aria-hidden', 'true');
            const immediateThumb =
              data.thumbUrl || data.thumbnailUrl || resolvedVideoForItem?.thumbUrl || '';
            applyThumbnailImage(thumbEl, immediateThumb);
            button.append(avatarEl, contentEl, thumbEl);
          } else {
            button.append(avatarEl, contentEl);
          }

          // Async safe enrichment of avatar & thumbnail
          void (async () => {
            if (hasVideo && !resolvedVideoForItem?.thumbUrl && !(data.thumbUrl || data.thumbnailUrl)) {
              const meta = await resolveVideoMetadata(data.videoId);
              if (renderToken !== listRenderEpoch || uid !== ownerUid || !button.isConnected) return;
              if (meta.status === 'ok' && meta.video) {
                resolvedVideoForItem = meta.video;
                if (thumbEl && meta.video.thumbUrl) {
                  applyThumbnailImage(thumbEl, meta.video.thumbUrl);
                }
              }
            }

            const avatarInfo = await resolveNotificationAvatar(
              data,
              ownerUid,
              resolvedVideoForItem
            );
            if (renderToken !== listRenderEpoch || uid !== ownerUid || !avatarEl.isConnected) return;
            applyAvatarImage(avatarEl, avatarInfo.url, avatarInfo.initial);
          })();

          // Click behavior
          button.addEventListener('click', async () => {
            if (
              !auth.currentUser ||
              auth.currentUser.isAnonymous ||
              auth.currentUser.uid !== ownerUid
            ) {
              return;
            }

            const needsReadUpdate = data.read !== true;
            if (needsReadUpdate) {
              button.disabled = true;
              try {
                await updateDoc(item.ref, { read: true });
                if (auth.currentUser?.uid !== ownerUid) return;
                data.read = true;
                button.classList.remove('unread');
              } catch (error) {
                console.error('通知の既読更新失敗:', error);
                statusEl.hidden = false;
                statusEl.classList.remove('is-empty');
                statusEl.textContent = t('既読にできませんでした。通信状態を確認してください。');
                button.disabled = false;
                return;
              }
              button.disabled = false;
            }

            if (hasVideo) {
              void openCommentsView(data, ownerUid, resolvedVideoForItem);
            } else {
              closePanel();
              if (data.kind === 'subscribers') {
                void showMyProfile(ownerUid);
              }
            }
          });

          fragment.appendChild(button);
        }

        listEl.appendChild(fragment);
      },
      error => {
        if (uid !== ownerUid) return;
        console.error('通知の読み込み失敗:', error);
        listEl.replaceChildren();
        bell.classList.remove('has-unread');
        statusEl.hidden = false;
        statusEl.classList.add('is-empty');
        statusEl.textContent = t('通知を取得できませんでした。Firestoreルールを確認してください。');
      }
    );
  });

  const handleResize = () => {
    placeNotificationBell();
    syncVisibility();
    if (panel.open) positionPanel();
  };

  mobileQuery.addEventListener('change', handleResize);
  window.addEventListener('resize', () => {
    if (panel.open) positionPanel();
  });

  window.addEventListener('popstate', () => {
    if (panel.open) closePanel();
  });

  new MutationObserver(syncVisibility).observe(homeScreen, {
    attributes: true,
    childList: true,
    subtree: true
  });

  new MutationObserver(syncVisibility).observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });

  syncVisibility();

  return {
    close: closePanel,
    refreshPosition: positionPanel
  };
}
