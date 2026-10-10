const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

function install() {
  const target = path.join(__dirname, 'index.html');
  const original = fs.readFileSync(target, 'utf8');
  let html = original.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  if (html.includes('// SECURITY V2:')) {
    throw new Error(
      'このindex.htmlには修正済みコードが入っています。二重適用を停止しました。'
    );
  }

  if (!html.includes('runTransaction')) {
    throw new Error('元のindex.htmlの版が違います。');
  }

  function replace(oldText, newText, expected = 1) {
    const count = html.split(oldText).length - 1;

    if (count !== expected) {
      throw new Error(
        '置換対象が一致しません。元ファイルは変更しません：' +
        oldText.slice(0, 90)
      );
    }

    html = html.split(oldText).join(newText);
  }

  function section(start, end, value) {
    const a = html.indexOf(start);
    const b = html.indexOf(end, a + start.length);

    if (a < 0 || b < 0) {
      throw new Error('置換区間が見つかりません：' + start);
    }

    html = html.slice(0, a) + value + '\n' + html.slice(b);
  }

  const functions = [
    cleanStringList,
    migratePrivateProfile,
    setChannelSubscription,
    migrateLegacySubscriptions,
    readMySubscriptions,
    displaySubscriberCount,
    toggleCommentVote,
    secureAuthChanged,
    secureReport,
    secureSubscribe
  ];

  const helper =
    '// SECURITY V2: private settings and atomic operations\n' +
    'const subscriberCountListeners = new Map();\n' +
    'const commentVotePending = new Set();\n' +
    'let accountLoadVersion = 0;\n' +
    functions.map(fn => fn.toString()).join('\n\n') + '\n';

  replace(
    '    async function showMyProfile(targetUid = null) {',
    helper + '    async function showMyProfile(targetUid = null) {'
  );

  section(
    'onAuthStateChanged(auth, async (user) => {',
    '    const categoryBtns =',
    'onAuthStateChanged(auth, secureAuthChanged);'
  );

  for (const [field, count] of [
    ['notInterestedUids', 1],
    ['blockedUids', 2]
  ]) {
    replace(
      "setDoc(doc(db, 'users', currentUser.uid), { " + field + ':',
      "setDoc(doc(db, 'userPrivate', currentUser.uid), { " + field + ':',
      count
    );
  }

  section(
    "    reportBtn.addEventListener('click', async () => {",
    '    blockUserBtn.addEventListener',
    "    reportBtn.addEventListener('click', secureReport);"
  );

  section(
    '    if (subscribeBtn) {',
    '    const manageScreen =',
    "    if (subscribeBtn) subscribeBtn.addEventListener('click', secureSubscribe);"
  );

  replace(
    "const userRef = doc(db, 'users', currentUser.uid);",
    "const userRef = doc(db, 'userPrivate', currentUser.uid);"
  );

  section(
    "      if (target.closest('.like-comment-btn')) {",
    "    });\n    commentList.addEventListener('input'",
    `
      const voteButton =
        target.closest('.like-comment-btn, .dislike-comment-btn');

      if (voteButton) {
        await toggleCommentVote(
          voteButton.dataset.id,
          voteButton.classList.contains('like-comment-btn')
            ? 'like'
            : 'dislike'
        );
        return;
      }
`
  );

  replace(
    "const userSnap = await getDoc(doc(db, 'users', uid));\n" +
    "      const userData = userSnap.exists() ? userSnap.data() : " +
    "{ channelName: 'ゲスト', subscriberCount: 0 };",
    `let userData = {
        channelName:
          allVideos.find(v => v.uploaderUid === uid)?.uploaderName ||
          'チャンネル',
        avatarUrl: ''
      };

      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) userData = userSnap.data();
      } catch (error) {
        console.warn('公開プロフィールの取得を保留:', error);
      }`
  );

  replace(
    "document.getElementById('channelSubscriberCount').textContent = " +
    "userData.subscriberCount || 0;",
    "displaySubscriberCount(" +
    "uid, document.getElementById('channelSubscriberCount'), false);"
  );

  replace(
    'subCountEl.textContent = ' +
    '`チャンネル登録者数 ${uData.subscriberCount || 0}人`;',
    '// 登録者数はchannelStatsから取得する。'
  );

  replace(
    '  hasLiked = false; \n  hasDisliked = false;',
    '  displaySubscriberCount(videoData.uploaderUid, subCountEl);\n' +
    '  hasLiked = false; \n  hasDisliked = false;'
  );

  const oldThumb =
    "if (thumbInput.files && thumbInput.files[0]) { " +
    "saveBtn.textContent = 'サムネイル送信中...'; try { " +
    "const thumbFile = thumbInput.files[0]; " +
    "const thumbRef = ref(storage, 'thumbnails/' + Date.now() + '_' + thumbFile.name); " +
    "await uploadBytes(thumbRef, thumbFile); " +
    "finalThumbUrl = await getDownloadURL(thumbRef); } catch {} }";

  if (html.includes(oldThumb)) {
    replace(oldThumb, `
if (thumbInput.files && thumbInput.files[0]) {
  saveBtn.textContent = 'サムネイル送信中...';

  try {
    const thumbFile = thumbInput.files[0];
    const thumbRef = ref(
      storage,
      'thumbnails/' + crypto.randomUUID() + '_' + thumbFile.name
    );

    await uploadBytes(thumbRef, thumbFile, {
      customMetadata: { uploaderUid: uploadUser.uid }
    });

    finalThumbUrl = await getDownloadURL(thumbRef);
  } catch (error) {
    console.error(error);
    alert('サムネイルを保存できませんでした。');
    saveBtn.textContent = '保存して公開';
    saveBtn.disabled = false;
    return;
  }
}`);
  }

  html = html.replace(
    'comment.authorUid === (currentUser && currentUser.uid) && currentUser.avatarUrl',
    'currentUser && comment.authorUid === currentUser.uid && currentUser.avatarUrl'
  );

  const oldMetadata =
    'const newCustomMetadata = { ...currentEditVideo.originalCustomMetadata, title:';

  if (html.includes(oldMetadata)) {
    replace(
      oldMetadata,
      'const latestVideoMetadata = await getMetadata(currentEditVideo.itemRef);\n' +
      '        const newCustomMetadata = { ...latestVideoMetadata.customMetadata, title:'
    );
  }

  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g
    )
  ];

  if (!scripts.length) {
    throw new Error('JavaScriptが見つかりません。');
  }

  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'submovie-check-')
  );

  try {
    const checkFile = path.join(temporary, 'check.mjs');

    fs.writeFileSync(
      checkFile,
      scripts.map(m => m[1]).join('\n')
    );

    const result = spawnSync(
      process.execPath,
      ['--check', checkFile],
      { encoding: 'utf8' }
    );

    if (result.status !== 0) {
      throw new Error(
        result.stderr || '構文チェックに失敗しました。'
      );
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }

  const backupFolder = path.join(
    path.dirname(__dirname),
    path.basename(__dirname) + '-security-backups'
  );

  fs.mkdirSync(backupFolder, { recursive: true });

  const stamp = Date.now();
  const backup = path.join(
    backupFolder,
    'index-' + stamp + '.html'
  );

  fs.writeFileSync(backup, original, { flag: 'wx' });

  const rulesPath = path.join(
    __dirname,
    'firestore-security.rules'
  );

  if (fs.existsSync(rulesPath)) {
    fs.copyFileSync(
      rulesPath,
      path.join(backupFolder, 'rules-' + stamp + '.txt')
    );
  }

  fs.writeFileSync(rulesPath, RULES);
  fs.writeFileSync(target, html);

  console.log('修正完了。バックアップ：' + backup);
  console.log(
    '次に firestore-security.rules の全文をFirestoreルールへ貼って公開してください。'
  );
  console.log(
    'index.html をGitHubへ反映後、メイン・サブでログインしてください。'
  );
}

// 以下の関数は、修正後のindex.htmlへ組み込まれます。

function cleanStringList(value) {
  return [...new Set(
    (Array.isArray(value) ? value : []).filter(
      x => typeof x === 'string' &&
        x && x !== 'null' && x !== 'undefined'
    )
  )];
}

async function migratePrivateProfile(user) {
  const publicRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'userPrivate', user.uid);

  return runTransaction(db, async tx => {
    const publicSnap = await tx.get(publicRef);
    const privateSnap = await tx.get(privateRef);

    const profile = publicSnap.exists() ? publicSnap.data() : {};
    const stored = privateSnap.exists() ? privateSnap.data() : {};

    const publicKeys = [
      'channelName', 'avatarUrl', 'createdAt', 'subscriberCount'
    ];

    const needsMove = Object.keys(profile).some(
      key => !publicKeys.includes(key)
    );

    const privateData = {
      ...stored,
      blockedUids: cleanStringList(
        stored.blockedUids ?? profile.blockedUids
      ),
      notInterestedUids: cleanStringList(
        stored.notInterestedUids ?? profile.notInterestedUids
      ),
      savedVideos: cleanStringList(
        stored.savedVideos ?? profile.savedVideos
      ),
      pendingSubscriptions: cleanStringList([
        ...cleanStringList(stored.pendingSubscriptions),
        ...cleanStringList(profile.subscribedTo)
      ]).filter(id => id !== user.uid && !id.includes('/'))
    };

    if (needsMove) {
      privateData.legacyProfile = {
        ...(stored.legacyProfile || {}),
        ...profile
      };

      const publicData = {};

      for (const key of publicKeys) {
        if (Object.prototype.hasOwnProperty.call(profile, key)) {
          publicData[key] = profile[key];
        }
      }

      tx.set(privateRef, privateData);
      tx.set(publicRef, publicData);
    } else if (!privateSnap.exists()) {
      tx.set(privateRef, privateData);
    }

    return { profile, privateData };
  });
}

async function setChannelSubscription(
  user,
  channelUid,
  desired = null,
  onlyIfMissing = false
) {
  if (
    !user ||
    user.isAnonymous ||
    auth.currentUser?.uid !== user.uid
  ) {
    throw new Error('ログイン状態を確認してください。');
  }

  if (
    !channelUid ||
    ['null', 'undefined', user.uid].includes(channelUid) ||
    channelUid.includes('/')
  ) {
    throw new Error('登録先が正しくありません。');
  }

  const relationRef = doc(
    db, 'userPrivate', user.uid, 'subscriptions', channelUid
  );
  const countRef = doc(db, 'channelStats', channelUid);

  return runTransaction(db, async tx => {
    const relationSnap = await tx.get(relationRef);
    const countSnap = await tx.get(countRef);

    const before =
      relationSnap.exists() && relationSnap.data().active === true;

    const count = countSnap.exists() ? countSnap.data().count : 0;

    if (!Number.isInteger(count) || count < 0) {
      throw new Error('登録者数のデータを確認してください。');
    }

    const after = desired === null ? !before : desired;

    if (
      (onlyIfMissing && relationSnap.exists()) ||
      after === before
    ) {
      return { active: before, count };
    }

    const nextCount = count + (after ? 1 : -1);

    if (nextCount < 0) {
      throw new Error('登録者数のデータを確認してください。');
    }

    tx.set(relationRef, {
      active: after,
      updatedAt: serverTimestamp()
    });

    tx.set(countRef, { count: nextCount });

    return { active: after, count: nextCount };
  });
}

async function migrateLegacySubscriptions(user, ids) {
  const remaining = [];

  for (const channelUid of cleanStringList(ids)) {
    if (auth.currentUser?.uid !== user.uid) return;

    try {
      await setChannelSubscription(user, channelUid, true, true);

      await updateDoc(doc(db, 'userPrivate', user.uid), {
        pendingSubscriptions: arrayRemove(channelUid)
      });
    } catch (error) {
      console.error('登録先の移行を保留:', channelUid, error);
      remaining.push(channelUid);
    }
  }

  if (remaining.length && auth.currentUser?.uid === user.uid) {
    alert(
      '一部の登録先を移行できませんでした。' +
      '元の情報は非公開で保持しています。' +
      '通信状態を確認し、再ログインしてください。'
    );
  }
}

async function readMySubscriptions(uid) {
  const snap = await getDocs(query(
    collection(db, 'userPrivate', uid, 'subscriptions'),
    where('active', '==', true)
  ));

  return snap.docs.map(item => item.id);
}

function displaySubscriberCount(uid, element, labeled = true) {
  subscriberCountListeners.get(element)?.();
  subscriberCountListeners.delete(element);

  if (!uid || ['null', 'undefined'].includes(uid)) {
    element.textContent = labeled ? 'チャンネル登録者数 0人' : '0';
    return;
  }

  const unsubscribe = onSnapshot(
    doc(db, 'channelStats', uid),
    snap => {
      const count = snap.exists() ? snap.data().count : 0;

      element.textContent = labeled
        ? `チャンネル登録者数 ${count}人`
        : String(count);
    },
    error => {
      console.error('登録者数の取得失敗:', error);
      element.textContent = labeled
        ? 'チャンネル登録者数を取得できません'
        : '—';
    }
  );

  subscriberCountListeners.set(element, unsubscribe);
}

async function toggleCommentVote(commentId, kind) {
  const user = auth.currentUser;

  if (!user || user.isAnonymous) {
    return alert('評価するにはログインしてください。');
  }

  if (commentVotePending.has(commentId)) return;
  commentVotePending.add(commentId);

  try {
    const reference = doc(db, 'comments', commentId);

    await runTransaction(db, async tx => {
      const snap = await tx.get(reference);

      if (!snap.exists()) {
        throw new Error('コメントが削除されています。');
      }

      const data = snap.data();
      const oldLikes = data.likedUsers || [];
      const oldDislikes = data.dislikedUsers || [];

      const cancel = (
        kind === 'like' ? oldLikes : oldDislikes
      ).includes(user.uid);

      const likedUsers = oldLikes.filter(uid => uid !== user.uid);
      const dislikedUsers = oldDislikes.filter(uid => uid !== user.uid);

      if (!cancel) {
        (kind === 'like' ? likedUsers : dislikedUsers).push(user.uid);
      }

      tx.update(reference, {
        likedUsers,
        dislikedUsers,
        likes:
          (data.likes || 0) + likedUsers.length - oldLikes.length,
        dislikes:
          (data.dislikes || 0) + dislikedUsers.length - oldDislikes.length
      });
    });
  } catch (error) {
    console.error('コメント評価失敗:', error);
    alert(
      '評価を保存できませんでした。少し待ってから再度お試しください。'
    );
  } finally {
    commentVotePending.delete(commentId);
  }
}

async function secureAuthChanged(user) {
  const version = ++accountLoadVersion;

  const videoEntriesRequest =
    initialVideoEntriesRequest ||
    fetchVideoEntries().then(
      videos => ({ videos }),
      error => ({ error })
    );

  initialVideoEntriesRequest = null;

  currentUser = null;
  currentUserBlocks = [];
  currentUserNotInterested = [];
  currentUserSubscriptions = [];
  currentUserSaved = [];

  if (user && !user.isAnonymous) {
    let channelName = 'ゲストチャンネル';
    let avatarUrl = '';

    try {
      const { profile, privateData } =
        await migratePrivateProfile(user);

      if (
        version !== accountLoadVersion ||
        auth.currentUser?.uid !== user.uid
      ) return;

      channelName = profile.channelName || user.displayName || channelName;
      avatarUrl = profile.avatarUrl || '';

      currentUserBlocks = privateData.blockedUids;
      currentUserNotInterested = privateData.notInterestedUids;
      currentUserSaved = privateData.savedVideos;

      await migrateLegacySubscriptions(
        user,
        privateData.pendingSubscriptions
      );

      const subscriptions = await readMySubscriptions(user.uid);

      if (
        version !== accountLoadVersion ||
        auth.currentUser?.uid !== user.uid
      ) return;

      currentUserSubscriptions = subscriptions;
    } catch (error) {
      if (version !== accountLoadVersion) return;

      console.error('ユーザー情報の読み込み・移行失敗:', error);
      alert(
        'ユーザー情報を読み込めませんでした。' +
        '新しいFirestoreルールが公開済みか確認し、再ログインしてください。'
      );
    }

    if (
      version !== accountLoadVersion ||
      auth.currentUser?.uid !== user.uid
    ) return;

    currentUser = { uid: user.uid, channelName, avatarUrl };

    loginOpenBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    channelNameDisplay.textContent = channelName;

    if (avatarUrl) {
      userProfileAvatar.style.backgroundImage = `url(${avatarUrl})`;
      userProfileAvatar.style.backgroundSize = 'cover';
      userProfileAvatar.textContent = '';
    } else {
      userProfileAvatar.style.backgroundImage = 'none';
      userProfileAvatar.textContent = channelName.charAt(0).toUpperCase();
    }

    nicknameArea.style.display = 'none';
    channelBadge.style.display = 'block';
    channelBadge.textContent = '「' + channelName + '」としてコメントします';
  } else {
    loginOpenBtn.style.display = 'inline-flex';
    userInfo.style.display = 'none';
    nicknameArea.style.display = 'block';
    channelBadge.style.display = 'none';
  }

  updateAvatarLetter();
  loadVideoList(videoEntriesRequest);
}

async function secureReport() {
  const user = auth.currentUser;

  if (!user || user.isAnonymous) {
    return alert('通報するにはログインしてください。');
  }

  const videoId = currentVideoId;
  if (!videoId) return;

  const reason = prompt(
    '通報の理由を入力してください（2000文字以内）'
  )?.trim();

  if (!reason) return;

  if (reason.length > 2000) {
    return alert('通報理由は2000文字以内で入力してください。');
  }

  reportBtn.disabled = true;

  try {
    await addDoc(collection(db, 'reports'), {
      videoId,
      videoTitle: mainTitle.textContent.slice(0, 1000),
      uploaderUid: uploaderNameEl.dataset.uid || '',
      reportedBy: user.uid,
      reason,
      createdAt: serverTimestamp(),
      status: 'pending'
    });

    alert('通報を受け付けました。');
  } catch (error) {
    console.error('通報の保存失敗:', error);
    alert(
      '通報を保存できませんでした。通信とログイン状態を確認してください。'
    );
  } finally {
    reportBtn.disabled = false;
  }
}

async function secureSubscribe() {
  const user = auth.currentUser;

  if (!user || user.isAnonymous) {
    return alert('チャンネル登録するにはログインしてください。');
  }

  const channelUid = subscribeBtn.dataset.targetUid;
  subscribeBtn.disabled = true;

  try {
    const result = await setChannelSubscription(user, channelUid);

    if (auth.currentUser?.uid !== user.uid) return;

    currentUserSubscriptions =
      currentUserSubscriptions.filter(uid => uid !== channelUid);

    if (result.active) {
      currentUserSubscriptions.push(channelUid);
    }

    if (subscribeBtn.dataset.targetUid === channelUid) {
      subscribeBtn.textContent =
        result.active ? '登録済み' : 'チャンネル登録';

      subscribeBtn.classList.toggle('subscribed', result.active);
    }
  } catch (error) {
    console.error('チャンネル登録の保存失敗:', error);
    alert(
      'チャンネル登録を変更できませんでした。少し待って再度お試しください。'
    );
  } finally {
    subscribeBtn.disabled = false;
  }
}

const RULES = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null
        && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }

    function isMe(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    function validVoteChange(usersField, countField) {
      let beforeUsers = resource.data.get(usersField, []);
      let afterUsers = request.resource.data.get(usersField, []);
      let beforeCount = resource.data.get(countField, 0);
      let afterCount = request.resource.data.get(countField, 0);

      return beforeUsers is list && afterUsers is list
        && beforeCount is int && afterCount is int && afterCount >= 0
        && afterUsers.size() == afterUsers.toSet().size()
        && afterUsers.toSet().difference(beforeUsers.toSet())
          .hasOnly([request.auth.uid])
        && beforeUsers.toSet().difference(afterUsers.toSet())
          .hasOnly([request.auth.uid])
        && afterCount == beforeCount
          + afterUsers.size() - beforeUsers.size();
    }

    function validVoteUpdate() {
      return signedIn()
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['likes', 'dislikes', 'likedUsers', 'dislikedUsers'])
        && validVoteChange('likedUsers', 'likes')
        && validVoteChange('dislikedUsers', 'dislikes')
        && !(request.auth.uid in request.resource.data.get('likedUsers', [])
          && request.auth.uid in request.resource.data.get('dislikedUsers', []));
    }

    match /comments/{commentId} {
      function validNewComment() {
        let d = request.resource.data;

        return d.keys().hasAll([
            'videoId', 'text', 'author', 'authorUid', 'type', 'createdAt'
          ])
          && d.keys().hasOnly([
            'videoId', 'text', 'author', 'authorUid', 'type',
            'createdAt', 'parentId', 'videoTime'
          ])
          && d.authorUid == request.auth.uid
          && d.videoId is string
          && d.videoId.size() > 0 && d.videoId.size() <= 1024
          && d.author is string
          && d.author.size() > 0 && d.author.size() <= 200
          && d.text is string && d.text.size() > 0
          && d.createdAt == request.time
          && (
            (
              d.type == 'normal'
              && d.text.size() <= 2000
              && !('videoTime' in d)
              && (
                d.get('parentId', null) == null
                || (
                  d.parentId is string
                  && d.parentId.size() > 0
                  && d.parentId.size() <= 128
                )
              )
            )
            || (
              d.type == 'danmaku'
              && d.text.size() <= 200
              && d.videoTime is number && d.videoTime >= 0
              && d.get('parentId', null) == null
            )
          );
      }

      allow read: if true;
      allow create: if signedIn() && validNewComment();
      allow update: if validVoteUpdate();
      allow delete: if signedIn()
        && resource.data.authorUid == request.auth.uid;
    }

    match /videoStats/{videoId} {
      allow read: if true;

      allow create:
        if request.resource.data.keys().hasAll(['views', 'likes', 'dislikes'])
        && request.resource.data.keys().hasOnly([
          'views', 'likes', 'dislikes', 'likedUsers', 'dislikedUsers'
        ])
        && request.resource.data.views is int
        && request.resource.data.views == 1
        && request.resource.data.likes is int
        && request.resource.data.likes == 0
        && request.resource.data.dislikes is int
        && request.resource.data.dislikes == 0
        && request.resource.data.get('likedUsers', []) == []
        && request.resource.data.get('dislikedUsers', []) == [];

      allow update: if (
        request.resource.data.diff(resource.data)
          .affectedKeys().hasOnly(['views'])
        && request.resource.data.views is int
        && request.resource.data.views == resource.data.views + 1
      ) || validVoteUpdate();

      allow delete: if false;
    }

    function publicProfileKeys(d) {
      return d.keys().hasOnly([
        'channelName', 'avatarUrl', 'createdAt', 'subscriberCount'
      ]);
    }

    function validPublicProfile(d) {
      return publicProfileKeys(d)
        && d.channelName is string
        && d.channelName.size() > 0 && d.channelName.size() <= 200
        && d.get('avatarUrl', '') is string
        && d.get('avatarUrl', '').size() <= 4096
        && d.get('subscriberCount', 0) is int
        && d.get('subscriberCount', 0) >= 0;
    }

    match /users/{userId} {
      allow get: if isMe(userId)
        || resource == null
        || publicProfileKeys(resource.data);

      allow list: if false;

      allow create: if isMe(userId)
        && validPublicProfile(request.resource.data)
        && request.resource.data.createdAt == request.time
        && request.resource.data.get('subscriberCount', 0) == 0;

      allow update: if isMe(userId)
        && validPublicProfile(request.resource.data)
        && request.resource.data.get('subscriberCount', 0)
          == resource.data.get('subscriberCount', 0)
        && request.resource.data.get('createdAt', null)
          == resource.data.get('createdAt', null);

      allow delete: if false;
    }

    function validPrivateSettings(d) {
      return d.keys().hasOnly([
          'blockedUids', 'notInterestedUids', 'savedVideos',
          'pendingSubscriptions', 'legacyProfile'
        ])
        && d.get('blockedUids', []) is list
        && d.get('notInterestedUids', []) is list
        && d.get('savedVideos', []) is list
        && d.get('pendingSubscriptions', []) is list
        && d.get('legacyProfile', {}) is map;
    }

    match /userPrivate/{userId} {
      allow read: if isMe(userId);

      allow create, update: if isMe(userId)
        && validPrivateSettings(request.resource.data);

      allow delete: if false;

      match /subscriptions/{channelId} {
        allow read: if isMe(userId);

        allow create, update: if isMe(userId)
          && request.resource.data.keys().hasAll(['active', 'updatedAt'])
          && request.resource.data.keys().hasOnly(['active', 'updatedAt'])
          && request.resource.data.active is bool
          && request.resource.data.updatedAt == request.time
          && validSubscriptionPair(userId, channelId);

        allow delete: if false;
      }
    }

    function validSubscriptionPair(uid, channelId) {
      let relationPath =
        /databases/$(database)/documents/userPrivate/$(uid)/subscriptions/$(channelId);
      let countPath =
        /databases/$(database)/documents/channelStats/$(channelId);

      let before = exists(relationPath)
        ? get(relationPath).data.active : false;
      let after = getAfter(relationPath).data.active;
      let oldCount = exists(countPath) ? get(countPath).data.count : 0;
      let next = getAfter(countPath).data;

      return isMe(uid) && uid != channelId
        && exists(/databases/$(database)/documents/users/$(channelId))
        && before is bool && after is bool && after != before
        && oldCount is int && oldCount >= 0
        && next.keys().hasOnly(['count'])
        && next.count is int && next.count >= 0
        && next.count == oldCount + (after ? 1 : -1);
    }

    match /channelStats/{channelId} {
      allow read: if true;

      allow create, update: if signedIn()
        && validSubscriptionPair(request.auth.uid, channelId);

      allow delete: if false;
    }

    match /reports/{reportId} {
      allow create: if signedIn()
        && request.resource.data.keys().hasAll([
          'videoId', 'videoTitle', 'uploaderUid',
          'reportedBy', 'reason', 'createdAt', 'status'
        ])
        && request.resource.data.keys().hasOnly([
          'videoId', 'videoTitle', 'uploaderUid',
          'reportedBy', 'reason', 'createdAt', 'status'
        ])
        && request.resource.data.reportedBy == request.auth.uid
        && request.resource.data.videoId is string
        && request.resource.data.videoId.size() > 0
        && request.resource.data.videoId.size() <= 1024
        && request.resource.data.videoTitle is string
        && request.resource.data.videoTitle.size() <= 1000
        && request.resource.data.uploaderUid is string
        && request.resource.data.uploaderUid.size() <= 128
        && request.resource.data.reason is string
        && request.resource.data.reason.size() > 0
        && request.resource.data.reason.size() <= 2000
        && request.resource.data.createdAt == request.time
        && request.resource.data.status == 'pending';

      allow read, update, delete: if false;
    }
  }
}
`;

try {
  install();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}