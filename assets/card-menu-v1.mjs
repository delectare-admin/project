import { t } from './site-language-v1.mjs?v=20261024-1';
import { createUiIcon, setUiIcon } from './ui-icons-v1.mjs?v=20261022';

// Shared 3-dot card menu (home, channel, search, related sidebar) and floating download status.
export function createCardMenuManager(handlers) {
  let activeMenu = null;
  let activeButton = null;
  let activeDownloadController = null;
  let statusBar = null;
  let statusText = null;
  let statusCancel = null;
  let statusHideTimer = 0;

  function closeAll(restoreFocus = false) {
    if (activeMenu) {
      activeMenu.classList.remove('active');
      activeMenu.style.left = '';
      activeMenu.style.top = '';
    }
    const previousButton = activeButton;
    if (activeButton) {
      activeButton.setAttribute('aria-expanded', 'false');
    }
    activeMenu = null;
    activeButton = null;
    document.querySelectorAll('.grid-dropdown.active').forEach(node => {
      node.classList.remove('active');
      node.style.left = '';
      node.style.top = '';
    });
    if (restoreFocus && previousButton?.isConnected) {
      previousButton.focus({ preventScroll: true });
    }
  }

  function positionDropdown(button, dropdown) {
    const rect = button.getBoundingClientRect();
    const box = dropdown.getBoundingClientRect();
    const margin = 12;
    const width = box.width || 240;
    const height = box.height || 220;

    let left = rect.right - width;
    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - width - margin;
    }
    left = Math.max(margin, left);

    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - margin) {
      const above = rect.top - height - 6;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin);
    }

    dropdown.style.left = `${Math.round(left)}px`;
    dropdown.style.top = `${Math.round(top)}px`;
  }

  document.addEventListener('click', event => {
    if (!activeMenu) return;
    if (!event.target.closest('.grid-menu-wrapper')) closeAll();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeMenu) {
      event.preventDefault();
      closeAll(true);
    }
  });

  window.addEventListener('resize', () => {
    if (activeMenu && activeButton) positionDropdown(activeButton, activeMenu);
  });

  window.addEventListener('scroll', event => {
    if (!activeMenu) return;
    if (event.target instanceof Node && activeMenu.contains(event.target)) return;
    closeAll();
  }, true);

  function ensureStatusBar() {
    if (statusBar?.isConnected) return statusBar;
    statusBar = document.createElement('div');
    statusBar.id = 'cardDownloadProgress';
    statusBar.hidden = true;
    statusBar.setAttribute('role', 'status');
    statusText = document.createElement('span');
    statusCancel = document.createElement('button');
    statusCancel.type = 'button';
    statusCancel.textContent = t("キャンセル");
    statusCancel.setAttribute('aria-label', t("動画の保存をキャンセル"));
    statusCancel.hidden = true;
    statusCancel.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      activeDownloadController?.abort();
    });
    statusBar.append(statusText, statusCancel);
    document.body.appendChild(statusBar);
    return statusBar;
  }

  function createMenuItem(className, iconName, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `grid-dropdown-item ${className}`;
    button.setAttribute('role', 'menuitem');
    setUiIcon(button, iconName, label);
    return button;
  }

  function attach(container, video) {
    if (!container || !video?.itemRef?.fullPath) return null;
    container.querySelector(':scope > .grid-menu-wrapper')?.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'grid-menu-wrapper';

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'grid-menu-btn-yt';
    menuBtn.setAttribute('aria-label', t("動画のその他の操作"));
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.append(createUiIcon('more'));

    const dropdown = document.createElement('div');
    dropdown.className = 'grid-dropdown';
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-label', t("動画のその他の操作"));

    const saveItem = createMenuItem('save-video-menu-btn', 'bookmark', t("保存"));
    const reportItem = createMenuItem('report-video-menu-btn', 'flag', t("通報"));
    const downloadItem = createMenuItem('download-video-menu-btn', 'download', t("動画をダウンロード"));
    const divider = document.createElement('div');
    divider.className = 'grid-dropdown-divider';
    divider.setAttribute('role', 'separator');
    const notInterestedItem = createMenuItem('not-interested-btn', 'eye-off', t("チャンネルをおすすめに表示しない"));
    const blockChannelItem = createMenuItem('block-channel-btn', 'block', t("チャンネルをブロックする"));

    if (video.uploaderUid) {
      notInterestedItem.dataset.uid = video.uploaderUid;
      blockChannelItem.dataset.uid = video.uploaderUid;
    }

    dropdown.append(saveItem, reportItem, downloadItem, divider, notInterestedItem, blockChannelItem);
    wrapper.append(menuBtn, dropdown);
    container.appendChild(wrapper);

    function syncSaveState() {
      const saved = Boolean(handlers.isSaved?.(video.itemRef.fullPath));
      setUiIcon(saveItem, saved ? 'bookmark-check' : 'bookmark', saved ? t("保存済み") : t("保存"));
      saveItem.classList.toggle('is-saved', saved);
    }

    wrapper.addEventListener('click', event => {
      event.stopPropagation();
    });

    menuBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = activeMenu !== dropdown;
      closeAll();
      if (!willOpen) return;
      syncSaveState();
      dropdown.classList.add('active');
      menuBtn.setAttribute('aria-expanded', 'true');
      activeMenu = dropdown;
      activeButton = menuBtn;
      positionDropdown(menuBtn, dropdown);
    });

    saveItem.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      closeAll();
      await handlers.onToggleSave?.(video, saveItem);
    });

    reportItem.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      closeAll();
      await handlers.onReport?.(video);
    });

    downloadItem.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      closeAll();
      await handlers.onDownload?.(video);
    });

    notInterestedItem.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      closeAll();
      await handlers.onNotInterested?.(video);
    });

    blockChannelItem.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      closeAll();
      await handlers.onBlockChannel?.(video);
    });

    return wrapper;
  }

  async function runDownload({
    videoId,
    title,
    makeTarget,
    saveDownload,
    statusElements = null,
    triggerButton = null
  }) {
    if (activeDownloadController) return;
    clearTimeout(statusHideTimer);
    statusHideTimer = 0;

    const useFloating = !statusElements;
    if (useFloating) ensureStatusBar();
    const box = statusElements?.box || statusBar;
    const messageEl = statusElements?.message || statusText;
    const cancelBtn = statusElements?.cancel || statusCancel;

    const controller = new AbortController();
    activeDownloadController = controller;
    if (triggerButton) triggerButton.disabled = true;
    box.hidden = false;
    box.dataset.state = 'working';
    cancelBtn.hidden = false;

    const onCancel = () => controller.abort();
    if (statusElements?.cancel) {
      statusElements.cancel.addEventListener('click', onCancel, { once: true });
    }

    try {
      const target = makeTarget(videoId, title);
      messageEl.textContent = t("「{0}」の保存を準備しています…", target.fileName);
      let handle = null;
      if (typeof window.showSaveFilePicker === 'function') {
        try {
          handle = await window.showSaveFilePicker({
            id: 'submovie-video-download',
            suggestedName: target.fileName,
            types: [{ description: t("動画ファイル"), accept: { [target.mime]: ['.' + target.extension] } }],
            excludeAcceptAllOption: true
          });
        } catch (error) {
          if (!['SecurityError', 'NotSupportedError'].includes(error.name)) throw error;
        }
      }
      const result = await saveDownload(target, handle, controller.signal, percent => {
        messageEl.textContent = t("「{0}」を取得中… {1}%", target.fileName, percent);
      });
      box.dataset.state = 'done';
      messageEl.textContent = result === 'saved'
        ? t("「{0}」を保存しました。", target.fileName)
        : t("「{0}」のダウンロードを開始しました。", target.fileName);
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) {
        messageEl.textContent = t("動画の保存をキャンセルしました。");
        box.dataset.state = 'done';
      } else {
        console.error('動画の端末保存に失敗:', error);
        box.dataset.state = 'error';
        messageEl.textContent = error instanceof TypeError
          ? t("動画を取得できませんでした。通信状態を確認してください。")
          : error.message || t("動画を保存できませんでした。");
      }
    } finally {
      if (statusElements?.cancel) {
        statusElements.cancel.removeEventListener('click', onCancel);
      }
      cancelBtn.hidden = true;
      if (triggerButton) triggerButton.disabled = false;
      activeDownloadController = null;
      if (useFloating) {
        statusHideTimer = window.setTimeout(() => {
          if (!activeDownloadController && statusBar) statusBar.hidden = true;
        }, 5000);
      }
    }
  }

  return { attach, closeAll, runDownload };
}
