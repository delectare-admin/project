import {t,th,locale} from './site-language-v1.mjs?v=20261024-1';
// Move existing controls only. Authentication, guarded writes and button handlers stay unchanged.
export function mountDesktopFullscreen() {
  const wrapper = document.getElementById('videoWrapper');
  const watch = document.getElementById('watchScreen');
  if (!wrapper || !watch || document.getElementById('desktopFullscreenActions')) return;
  const desktop = matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)');
  const bar = document.createElement('div');
  bar.id = 'desktopFullscreenActions'; bar.className = 'pc-fullscreen-actions';
  bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', t("全画面の弾幕と動画の操作"));
  bar.hidden = true; wrapper.appendChild(bar);
  let active = false, timer = 0, frame = 0, hiding = false, keyboard = false, keyAt = 0;
  const moved = new Map();
  const byId = id => document.getElementById(id) || wrapper.ownerDocument.getElementById(id);
  function move(node, parent) {
    if (!node || moved.has(node)) return;
    const slot = document.createComment('fullscreen control position');
    node.before(slot); moved.set(node, slot); parent.appendChild(node);
  }
  function closePanels() {
    const settings = byId('mobilePlaybackSettings'); if (settings) settings.hidden = true;
    byId('playerSettingsBtn')?.setAttribute('aria-expanded', 'false');
    const customizer = byId('danmakuCustomizeDialog'); if (customizer?.open) customizer.close();
    const menu = byId('watchMoreMenu'); if (menu) menu.hidden = true;
    byId('watchMoreButton')?.setAttribute('aria-expanded', 'false');
    const notice = byId('nearLoginNotice'); if (notice) notice.hidden = true;
    byId('shareModal')?.classList.remove('active');
  }
  function stopTimer() { clearTimeout(timer); timer = 0; }
  function pinned() {
    const focus = document.activeElement;
    if (wrapper.contains(focus) && (keyboard || focus?.matches('input,textarea,select,[contenteditable="true"]'))) return true;
    if (bar.matches(':hover')) return true;
    for (const id of ['mobilePlaybackSettings', 'danmakuCustomizeDialog', 'watchMoreMenu', 'nearLoginNotice', 'shareModal', 'authModal']) {
      const node = byId(id); if (!node) continue;
      const open = node.tagName === 'DIALOG' ? node.open
        : node.classList.contains('modal-overlay') ? node.classList.contains('active') : !node.hidden;
      if (open && (node.matches(':hover') || node.contains(focus) || id === 'authModal')) return true;
    }
    return false;
  }
  function scheduleHide() {
    stopTimer(); if (!active) return;
    timer = setTimeout(() => { timer = 0; if (pinned()) scheduleHide(); else hide(); }, 2500);
  }
  function show() {
    if (!active || hiding) return;
    wrapper.dataset.pcFullscreenControls = 'visible'; wrapper.dataset.pcControls = 'visible';
    scheduleHide();
  }
  function hide() {
    if (!active || hiding) return;
    hiding = true; stopTimer(); keyAt = 0;
    wrapper.dataset.pcFullscreenControls = 'hidden'; wrapper.dataset.pcControls = 'hidden';
    const focus = document.activeElement;
    if (bar.contains(focus) || byId('mobilePlaybackSettings')?.contains(focus) || byId('danmakuCustomizeDialog')?.contains(focus)) focus?.blur();
    closePanels(); hiding = false;
  }
  function updateHeight() {
    if (active) wrapper.style.setProperty('--pc-fullscreen-action-height', Math.ceil(bar.getBoundingClientRect().height) + 'px');
  }
  function enter() {
    const input = byId('danmakuInput')?.closest('.danmaku-input-area');
    const actions = byId('likeBtn')?.closest('.watch-rating-actions');
    if (!input || !actions) return;
    closePanels(); active = true; wrapper.classList.add('pc-fullscreen-player'); bar.hidden = false;
    move(input, bar); move(actions, bar);
    // Custom overlays must be descendants of the fullscreen element to remain visible.
    for (const id of ['watchMoreMenu', 'shareModal', 'nearLoginNotice', 'authModal', 'videoDownloadProgress']) move(byId(id), wrapper);
    updateHeight(); show();
  }
  function leave() {
    if (!active) return;
    active = false; stopTimer(); hiding = true; closePanels();
    const input = byId('danmakuInput')?.closest('.danmaku-input-area');
    const notices = [...bar.querySelectorAll(':scope > .guard-notice')];
    for (const [node, slot] of moved) {
      if (slot.parentNode) { slot.before(node); slot.remove(); }
    }
    moved.clear(); if (input?.parentNode && notices.length) input.after(...notices);
    bar.hidden = true; wrapper.classList.remove('pc-fullscreen-player');
    delete wrapper.dataset.pcFullscreenControls; wrapper.style.removeProperty('--pc-fullscreen-action-height');
    hiding = false;
  }
  function refresh() {
    frame = 0;
    const full = document.fullscreenElement || document.webkitFullscreenElement;
    const isFull = full === wrapper || !!full?.contains(wrapper) || wrapper.classList.contains('pseudo-fullscreen');
    const next = desktop.matches && wrapper.ownerDocument === document && isFull
      && getComputedStyle(watch).display !== 'none' && !wrapper.classList.contains('in-pip');
    if (next && !active) enter(); else if (!next && active) leave();
    if (active) updateHeight();
  }
  function queueRefresh() { if (!frame) frame = requestAnimationFrame(refresh); }
  for (const event of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(event, refresh);
  desktop.addEventListener('change', refresh);
  new MutationObserver(queueRefresh).observe(wrapper, {attributes: true, attributeFilter: ['class']});
  new MutationObserver(queueRefresh).observe(watch, {attributes: true, attributeFilter: ['style']});
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateHeight).observe(bar);
  window.addEventListener('resize', queueRefresh);
  wrapper.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') show(); });
  wrapper.addEventListener('pointermove', event => { if (event.pointerType === 'mouse') { keyboard = false; show(); } });
  wrapper.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  document.addEventListener('pointerdown', () => { keyboard = false; }, true);
  document.addEventListener('keydown', event => {
    if (!active || event.isComposing) return;
    if (event.key === 'Tab') { keyboard = true; keyAt = Date.now(); show(); }
  }, true);
  wrapper.addEventListener('focusin', () => { if (keyboard && Date.now() - keyAt < 500) show(); });
  wrapper.addEventListener('input', () => { if (active) scheduleHide(); });
  wrapper.addEventListener('focusout', () => { if (active) scheduleHide(); });
  refresh();
}
