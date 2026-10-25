// Page-local positioning only. No network, storage, authentication, or video-source changes.
export function mountStickyPipDrag() {
  const wrapper = document.getElementById('videoWrapper');
  const video = document.getElementById('mainVideo');
  const watch = document.getElementById('watchScreen');
  if (!wrapper || !video || !watch || wrapper.dataset.stickyDragMounted) return;
  wrapper.dataset.stickyDragMounted = 'true';
  const desktop = matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)');
  const hint = document.createElement('span');
  hint.id = 'stickyDragHint'; hint.hidden = true; hint.setAttribute('role', 'status');
  wrapper.append(hint);
  let press = null, position = null, suppressClickUntil = 0, frame = 0;
  const en = () => document.documentElement.lang === 'en';
  const english = {hold: 'Keep holding to move', drag: 'Drag to move · Esc to cancel'};
  const japanese = {hold: 'そのまま長押しで移動', drag: 'ドラッグで移動 · Escでキャンセル'};
  const interactive = '.site-player-controls,.custom-controls-bar,#mobilePlayerTools,#mobilePlaybackSettings,#mobileTenSecondControls,.pc-fullscreen-actions,button:not(#videoClickToggle),input,select,textarea,a,[contenteditable]:not([contenteditable="false"])';
  function eligible() {
    return desktop.matches && wrapper.ownerDocument === document && wrapper.isConnected
      && wrapper.classList.contains('is-sticky')
      && !wrapper.matches('.in-pip,.in-browse-mini,.pseudo-fullscreen,.pc-fullscreen-player')
      && !document.fullscreenElement && !document.webkitFullscreenElement
      && document.pictureInPictureElement !== video
      && !document.hidden && !watch.hidden && getComputedStyle(watch).display !== 'none';
  }
  function toggle(name, value) { if (wrapper.classList.contains(name) !== value) wrapper.classList.toggle(name, value); }
  function clearPlacement() {
    toggle('sticky-drag-positioned', false);
    wrapper.style.removeProperty('--sticky-drag-left');
    wrapper.style.removeProperty('--sticky-drag-top');
  }
  function place(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !eligible()) return;
    toggle('sticky-drag-positioned', true);
    const rect = wrapper.getBoundingClientRect();
    const width = document.documentElement.clientWidth || innerWidth;
    const height = innerHeight;
    position = {x: Math.max(8, Math.min(x, Math.max(8, width - rect.width - 8))),
      y: Math.max(8, Math.min(y, Math.max(8, height - rect.height - 8)))};
    wrapper.style.setProperty('--sticky-drag-left', position.x + 'px');
    wrapper.style.setProperty('--sticky-drag-top', position.y + 'px');
  }
  function finish({revert = false} = {}) {
    const previous = press; press = null;
    if (previous) {
      clearTimeout(previous.timer);
      if (previous.dragging) {
        suppressClickUntil = performance.now() + 1000;
        if (revert) {
          position = previous.previous;
          if (position && eligible()) place(position.x, position.y); else clearPlacement();
        }
      }
      try { if (wrapper.hasPointerCapture(previous.id)) wrapper.releasePointerCapture(previous.id); } catch { /* The pointer may already be released. */ }
    }
    toggle('sticky-drag-pending', false); toggle('sticky-dragging', false);
    document.body.classList.remove('sticky-video-drag-active'); hint.hidden = true;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
  }
  function sync() {
    if (!eligible()) { finish({revert: true}); clearPlacement(); return; }
    if (position && !press?.dragging) place(position.x, position.y);
  }
  function start(event) {
    // The next real press must not inherit suppression from the previous drag.
    suppressClickUntil = 0;
    if (press) finish({revert: true});
    if (event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0 || !eligible()
      || !wrapper.contains(event.target) || event.target.closest(interactive)) return;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const state = {id: event.pointerId, x: event.clientX, y: event.clientY,
      dx: event.clientX - rect.left, dy: event.clientY - rect.top,
      previous: position ? {...position} : null, dragging: false, timer: 0};
    press = state;
    hint.textContent = (en() ? english : japanese).hold; hint.hidden = false;
    toggle('sticky-drag-pending', true);
    state.timer = setTimeout(() => {
      if (press !== state || !eligible()) { finish(); return; }
      try { wrapper.setPointerCapture(state.id); } catch { finish(); return; }
      state.dragging = true;
      const current = wrapper.getBoundingClientRect();
      place(current.left, current.top);
      // Keep the point under the cursor stable when the viewport constrains the size.
      const fitted = wrapper.getBoundingClientRect();
      state.dx = Math.min(state.dx, fitted.width); state.dy = Math.min(state.dy, fitted.height);
      toggle('sticky-drag-pending', false); toggle('sticky-dragging', true);
      document.body.classList.add('sticky-video-drag-active');
      hint.textContent = (en() ? english : japanese).drag;
    }, 2000);
  }
  function move(event) {
    const state = press;
    if (!state || event.pointerId !== state.id) return;
    if (!eligible() || !(event.buttons & 1)) { finish({revert: true}); return; }
    if (!state.dragging) {
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > 8) finish();
      return;
    }
    event.preventDefault(); state.x = event.clientX; state.y = event.clientY;
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      if (press === state && eligible()) place(state.x - state.dx, state.y - state.dy);
    });
  }
  window.addEventListener('pointerdown', start, true);
  window.addEventListener('pointermove', move, {capture: true, passive: false});
  window.addEventListener('pointerup', event => {
    if (!press || event.pointerId !== press.id) return;
    if (press.dragging && eligible()) { event.preventDefault(); place(event.clientX - press.dx, event.clientY - press.dy); }
    finish();
  }, true);
  window.addEventListener('pointercancel', event => { if (press?.id === event.pointerId) finish({revert: true}); }, true);
  wrapper.addEventListener('lostpointercapture', event => { if (press?.id === event.pointerId) finish({revert: true}); });
  // Stop only the click generated by this long press, before the existing playback capture handler.
  window.addEventListener('click', event => {
    if (event.detail > 0 && wrapper.contains(event.target) && performance.now() < suppressClickUntil) {
      suppressClickUntil = 0; event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  wrapper.addEventListener('dragstart', event => { if (press) event.preventDefault(); });
  wrapper.addEventListener('selectstart', event => { if (press) event.preventDefault(); });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && press) { event.preventDefault(); event.stopImmediatePropagation(); finish({revert: true}); }
  }, true);
  window.addEventListener('blur', () => finish({revert: true}));
  window.addEventListener('pagehide', () => finish({revert: true}));
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish({revert: true}); });
  window.addEventListener('resize', () => { finish({revert: true}); sync(); });
  desktop.addEventListener('change', sync);
  document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
  video.addEventListener('enterpictureinpicture', sync); video.addEventListener('leavepictureinpicture', sync);
  video.addEventListener('loadstart', () => finish({revert: true}));
  new MutationObserver(sync).observe(wrapper, {attributes: true, attributeFilter: ['class']});
  new MutationObserver(sync).observe(watch, {attributes: true, attributeFilter: ['style', 'hidden']});
  new MutationObserver(() => finish({revert: true})).observe(video, {attributes: true, attributeFilter: ['src']});
  sync();
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountStickyPipDrag, {once: true});
  else mountStickyPipDrag();
}
