const {
  initializeApp,
  getApps
} = require('firebase-admin/app');

const {
  getFirestore,
  FieldValue
} = require('firebase-admin/firestore');

const { getStorage } = require('firebase-admin/storage');
const { createHash } = require('node:crypto');

if (!getApps().length) {
  initializeApp({
    projectId: 'testo-movie-site'
  });
}

const db = getFirestore();

const bucket = getStorage().bucket(
  'testo-movie-site.firebasestorage.app'
);

const hash = value =>
  createHash('sha256').update(value).digest('hex');

const statsKey = path => path.replace(/\//g, '__');

// 到達済みの節目を返す
function levels(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];

  const result = [];

  for (let n = 1; n <= count; n *= 10) {
    result.push(n);
  }

  return result;
}

function noticeRef(uid, kind, key, number) {
  const id = hash(JSON.stringify([kind, key, number]));

  return db.doc(
    `userNotifications/${uid}/items/${id}`
  );
}

function payload(kind, video, number) {
  return {
    kind,
    videoId: video?.path || '',
    title: video?.title || '',
    milestone: number,
    read: false,
    createdAt: FieldValue.serverTimestamp()
  };
}

// Storageに保存された投稿者情報から、通知先を記録
async function saveVideo(file) {
  const [metadata] = await file.getMetadata();
  const cm = metadata.metadata || {};

  if (
    !cm.uploaderUid ||
    cm.uploaderUid === 'null' ||
    cm.uploaderUid === 'undefined'
  ) {
    console.warn('投稿者UIDがない動画:', file.name);
    return null;
  }

  const value = {
    path: file.name,
    uid: cm.uploaderUid,
    title: String(cm.title || file.name).slice(0, 1000)
  };

  const ref = db.doc(
    `notificationVideoIndex/${hash(statsKey(file.name))}`
  );

  await db.runTransaction(async tx => {
    const old = await tx.get(ref);

    if (
      old.exists &&
      (
        old.data().path !== value.path ||
        old.data().uid !== value.uid
      )
    ) {
      throw new Error(
        '動画IDまたは投稿者情報が一致しません: ' + file.name
      );
    }

    tx.set(ref, value);
  });

  return value;
}

async function resolveVideo(key, fullPath = null) {
  const saved = await db.doc(
    `notificationVideoIndex/${hash(key)}`
  ).get();

  if (saved.exists) {
    if (fullPath && saved.data().path !== fullPath) {
      throw new Error('動画IDが重複しています');
    }

    return saved.data();
  }

  if (fullPath) {
    if (!fullPath.startsWith('videos/')) {
      return null;
    }

    return saveVideo(bucket.file(fullPath));
  }

  // 初めて通知対象になった動画の保存先を確認
  const [files] = await bucket.getFiles({
    prefix: 'videos/'
  });

  const matches = files.filter(
    file => statsKey(file.name) === key
  );

  if (matches.length !== 1) {
    console.warn('通知対象の動画を特定できません:', key);
    return null;
  }

  return saveVideo(matches[0]);
}

// 同じ節目の通知は作り直さない
async function emit(uid, kind, key, video, count) {
  const thresholds = levels(count);
  if (!thresholds.length) return;

  await db.runTransaction(async tx => {
    const refs = thresholds.map(number =>
      noticeRef(uid, kind, key, number)
    );

    const existing = await Promise.all(
      refs.map(ref => tx.get(ref))
    );

    existing.forEach((snapshot, i) => {
      if (!snapshot.exists) {
        tx.create(
          refs[i],
          payload(kind, video, thresholds[i])
        );
      }
    });
  });
}

// 投稿IDを記録し、同じ弾幕を二重に数えない
async function recordDanmaku(id, data) {
  if (data.type !== 'danmaku') return;

  if (
    typeof data.videoId !== 'string' ||
    !data.videoId.startsWith('videos/')
  ) return;

  const key = statsKey(data.videoId);

  const video = await resolveVideo(key, data.videoId);

  if (!video) return;

  const marker = db.doc(
    `notificationProcessedComments/${hash(id)}`
  );

  const counter = db.doc(
    `notificationDanmakuTotals/${hash(data.videoId)}`
  );

  await db.runTransaction(async tx => {
    const seen = await tx.get(marker);
    if (seen.exists) return;

    const snapshot = await tx.get(counter);

    const count =
      (snapshot.exists ? snapshot.data().count : 0) + 1;

    const due = levels(count).includes(count);

    const target = due
      ? noticeRef(video.uid, 'danmaku', key, count)
      : null;

    const existing = target
      ? await tx.get(target)
      : null;

    tx.create(marker, {
      videoId: data.videoId
    });

    tx.set(counter, { count });

    if (target && !existing.exists) {
      tx.create(
        target,
        payload('danmaku', video, count)
      );
    }
  });
}

module.exports = {
  db,
  bucket,
  statsKey,
  saveVideo,
  resolveVideo,
  emit,
  recordDanmaku
};