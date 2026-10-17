const { onCall, HttpsError } =
  require('firebase-functions/v2/https');

const { initializeApp } = require('firebase-admin/app');

const {
  getFirestore,
  FieldValue,
  Timestamp
} = require('firebase-admin/firestore');

const { getStorage } = require('firebase-admin/storage');
const { randomUUID } = require('node:crypto');

initializeApp();

const db = getFirestore();

const bucket = getStorage().bucket(
  'testo-movie-site.firebasestorage.app'
);

const DAY = 86400000;
const JST = 32400000;

const nowDay = now =>
  new Date(now + JST).toISOString().slice(0, 10);

const dayEnd = now =>
  (Math.floor((now + JST) / DAY) + 1) * DAY - JST;

const limits = {
  normal: [20000, 3],
  danmaku: [7000, 8]
};

function warning(count) {
  if (count >= 30) {
    return 'これ以上連投するのであれば、BAN対象となります。';
  }

  if (count >= 5) {
    return '連投や荒らしの可能性があります。';
  }

  return '上限を超えています。';
}

function limited(message, extra = {}) {
  return { ok: false, message, ...extra };
}

function textValue(value, max, name) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max
  ) {
    throw new HttpsError(
      'invalid-argument',
      `${name}を確認してください。`
    );
  }

  return value.trim();
}

// クライアントの任意のCSS・画像URLは保存しない。許可した文字設定だけを受け付ける。
function readDanmakuStyle(value) {
  if (value === undefined) return null; // 旧クライアントも投稿可能
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['color', 'position', 'size'].includes(key)) ||
      typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color) ||
      !['top', 'middle', 'bottom'].includes(value.position) ||
      typeof value.size !== 'number' || !Number.isFinite(value.size) ||
      value.size < 1 || value.size > 5) {
    throw new HttpsError('invalid-argument', '弾幕の色・位置・サイズを確認してください。');
  }
  return { color: value.color.toUpperCase(), position: value.position,
    size: Math.round(value.size * 10) / 10 };
}

function validId(value) {
  return typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

// 動画のコメント設定をサーバーでも確認する
async function getPolicy(videoId, type, text) {
  if (
    typeof videoId !== 'string' ||
    !videoId.startsWith('videos/') ||
    videoId.length > 1024 ||
    /[\u0000-\u001f\u007f]/.test(videoId)
  ) {
    throw new HttpsError(
      'invalid-argument',
      '動画IDを確認してください。'
    );
  }

  let metadata;

  try {
    [metadata] = await bucket.file(videoId).getMetadata();
  } catch (error) {
    if (Number(error.code) === 404) {
      throw new HttpsError(
        'not-found',
        '動画が見つかりません。'
      );
    }

    throw new HttpsError(
      'unavailable',
      '動画の設定を取得できませんでした。'
    );
  }

  const cm = metadata.metadata || {};

  const feature = type === 'danmaku'
    ? 'danmakuEnabled'
    : 'commentsEnabled';

  if (cm[feature] === 'false') {
    throw new HttpsError(
      'failed-precondition',
      '投稿者がこのコメント機能をオフにしています。'
    );
  }

  let words;

  try {
    words = JSON.parse(cm.mutedCommentWords || '[]');
  } catch {
    throw new HttpsError(
      'failed-precondition',
      '動画のミュートワード設定を確認してください。'
    );
  }

  if (
    !Array.isArray(words) ||
    words.length > 30 ||
    words.some(w => typeof w !== 'string' || w.length > 30)
  ) {
    throw new HttpsError(
      'failed-precondition',
      '動画のミュートワード設定を確認してください。'
    );
  }

  const normalized = text.normalize('NFKC').toLowerCase();

  if (
    words.some(w =>
      w.trim() &&
      normalized.includes(
        w.normalize('NFKC').toLowerCase().trim()
      )
    )
  ) {
    throw new HttpsError(
      'failed-precondition',
      '投稿者のミュートワードが含まれています。'
    );
  }
}

exports.submovieGuard = onCall({
  region: 'asia-northeast1',
  maxInstances: 10
}, async request => {
  const uid = request.auth?.uid;

  if (
    !uid ||
    request.auth.token.firebase?.sign_in_provider === 'anonymous'
  ) {
    throw new HttpsError(
      'unauthenticated',
      'ログインしてください。'
    );
  }

  const d = request.data || {};

  // 動画削除時は投稿許可も無効にする
  if (d.action === 'deleteVideo') {
    if (
      typeof d.videoId !== 'string' ||
      !d.videoId.startsWith('videos/') ||
      d.videoId.length > 1024 ||
      /[\u0000-\u001f\u007f]/.test(d.videoId)
    ) {
      throw new HttpsError(
        'invalid-argument',
        '動画IDを確認してください。'
      );
    }

    const file = bucket.file(d.videoId);
    let metadata;

    try {
      [metadata] = await file.getMetadata();
    } catch (error) {
      if (Number(error.code) === 404) return { ok: true };

      throw new HttpsError(
        'unavailable',
        '動画を確認できませんでした。'
      );
    }

    if (metadata.metadata?.uploaderUid !== uid) {
      throw new HttpsError(
        'permission-denied',
        '自分の動画だけ削除できます。'
      );
    }

    const ticketId = metadata.metadata.uploadTicketId;

    if (ticketId) {
      if (!/^[A-Za-z0-9_-]{1,300}$/.test(ticketId)) {
        throw new HttpsError(
          'failed-precondition',
          '動画の投稿予約情報を確認してください。'
        );
      }

      const ticketRef = db.doc(
        'videoUploadTickets/' + ticketId
      );

      await db.runTransaction(async tx => {
        const ticket = await tx.get(ticketRef);

        if (ticket.exists) {
          if (
            ticket.data().uid !== uid ||
            ticket.data().objectName !== d.videoId
          ) {
            throw new HttpsError(
              'permission-denied',
              '動画の投稿予約が一致しません。'
            );
          }

          tx.update(ticketRef, { active: false });
        }
      });
    }

    try {
      await file.delete({
        ifGenerationMatch: metadata.generation
      });
    } catch (error) {
      if (Number(error.code) !== 404) {
        throw new HttpsError(
          'unavailable',
          '削除できませんでした。もう一度操作してください。'
        );
      }
    }

    return { ok: true };
  }

  // 1日10件までの動画投稿予約
  if (d.action === 'upload') {
    if (
      !validId(d.requestId) ||
      !Number.isSafeInteger(d.size) ||
      d.size <= 0
    ) {
      throw new HttpsError(
        'invalid-argument',
        '動画ファイルの情報を確認してください。'
      );
    }

    const name = textValue(d.name, 200, 'ファイル名')
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_');

    const contentType =
      typeof d.contentType === 'string' &&
      /^video\/[a-z0-9.+-]+$/i.test(d.contentType)
        ? d.contentType.toLowerCase()
        : 'application/octet-stream';

    const objectName =
      'videos/' + randomUUID() + '_' + name;

    return db.runTransaction(async tx => {
      const now = Date.now();
      const day = nowDay(now);

      const ticketId =
        uid + '_' + day + '_' + d.requestId;

      const ticketRef = db.doc(
        'videoUploadTickets/' + ticketId
      );

      const dailyRef = db.doc(
        'videoUploadDays/' + uid + '_' + day
      );

      const [ticket, daily] = await Promise.all([
        tx.get(ticketRef),
        tx.get(dailyRef)
      ]);

      // 通信失敗後の再試行は同じ予約を返す
      if (ticket.exists) {
        const old = ticket.data();

        if (!old.active) {
          throw new HttpsError(
            'failed-precondition',
            'この投稿予約は終了しています。'
          );
        }

        if (
          old.size !== d.size ||
          old.originalName !== name ||
          old.contentType !== contentType
        ) {
          throw new HttpsError(
            'failed-precondition',
            '送信するファイルが変わりました。選び直してください。'
          );
        }

        return {
          ok: true,
          ticketId,
          objectName: old.objectName,
          contentType: old.contentType
        };
      }

      const count = daily.data()?.count || 0;

      if (count >= 10) {
        return limited(
          '投稿上限は10回までです。明日、また投稿してください',
          { kind: 'upload' }
        );
      }

      tx.set(dailyRef, {
        count: count + 1,
        uid,
        day
      });

      tx.create(ticketRef, {
        uid,
        bucket: bucket.name,
        objectName,
        originalName: name,
        size: d.size,
        contentType,
        active: true,
        expiresAt: Timestamp.fromMillis(dayEnd(now))
      });

      return {
        ok: true,
        ticketId,
        objectName,
        contentType
      };
    });
  }

  if (d.action !== 'post' && d.action !== 'edit') {
    throw new HttpsError(
      'invalid-argument',
      '操作を確認してください。'
    );
  }

  const type = d.action === 'edit' ? 'normal' : d.type;

  if (!Object.hasOwn(limits, type)) {
    throw new HttpsError(
      'invalid-argument',
      'コメント種別を確認してください。'
    );
  }

  const text = textValue(
    d.text,
    type === 'danmaku' ? 200 : 2000,
    '本文'
  );

  const danmakuStyle = type === 'danmaku' ? readDanmakuStyle(d.danmakuStyle) : null;

  await getPolicy(d.videoId, type, text);

  // コメント1件につき合計5回まで編集
  if (d.action === 'edit') {
    if (!validId(d.commentId)) {
      throw new HttpsError(
        'invalid-argument',
        'コメントIDを確認してください。'
      );
    }

    const ref = db.doc('comments/' + d.commentId);

    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const c = snapshot.data();

      if (
        !c ||
        c.authorUid !== uid ||
        c.videoId !== d.videoId ||
        c.type !== 'normal'
      ) {
        throw new HttpsError(
          'permission-denied',
          '自分の通常コメントだけ編集できます。'
        );
      }

      // 本文が変わらない場合は編集回数を消費しない
      if (c.text === text) return { ok: true };

      const count = c.editCount === undefined
        ? 0
        : c.editCount;

      if (
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count >= 5
      ) {
        return limited(
          '編集上限は5回までです。',
          { kind: 'edit' }
        );
      }

      if (
        typeof d.expectedText === 'string' &&
        c.text !== d.expectedText
      ) {
        throw new HttpsError(
          'aborted',
          '別の画面で本文が変更されました。開き直してください。'
        );
      }

      tx.update(ref, {
        text,
        editedAt: FieldValue.serverTimestamp(),
        editCount: count + 1
      });

      return { ok: true, editCount: count + 1 };
    });
  }

  const parentId = d.parentId ?? null;

  if (
    parentId !== null &&
    (type !== 'normal' || !validId(parentId))
  ) {
    throw new HttpsError(
      'invalid-argument',
      '返信先を確認してください。'
    );
  }

  if (
    type === 'danmaku' &&
    (!Number.isFinite(d.videoTime) || d.videoTime < 0)
  ) {
    throw new HttpsError(
      'invalid-argument',
      '弾幕の再生時刻を確認してください。'
    );
  }

  const rateRef = db.doc('commentRateLimits/' + uid);
  const profileRef = db.doc('users/' + uid);
  const postRef = db.collection('comments').doc();

  const parentRef = parentId
    ? db.doc('comments/' + parentId)
    : null;

  return db.runTransaction(async tx => {
    const [rateSnap, profileSnap, parentSnap] =
      await Promise.all([
        tx.get(rateRef),
        tx.get(profileRef),
        parentRef ? tx.get(parentRef) : Promise.resolve(null)
      ]);

    if (parentRef) {
      const parent = parentSnap.data();

      if (
        !parent ||
        parent.videoId !== d.videoId ||
        parent.type !== 'normal' ||
        parent.parentId
      ) {
        throw new HttpsError(
          'not-found',
          '返信先が見つかりません。'
        );
      }
    }

    const now = Date.now();
    const day = nowDay(now);
    const old = rateSnap.data() || {};

    // 日付が変わっても、直近1分の投稿記録は維持
    const state = {
      normal: (old.normal || []).filter(
        t => Number.isSafeInteger(t) && t > now - 60000
      ),
      danmaku: (old.danmaku || []).filter(
        t => Number.isSafeInteger(t) && t > now - 60000
      ),
      warningDay: day,
      warnings: old.warningDay === day
        ? (old.warnings || 0)
        : 0
    };

    const times = state[type];
    const [interval, max] = limits[type];

    const wait = Math.max(
      0,
      times.length
        ? times[times.length - 1] + interval - now
        : 0,
      times.length >= max
        ? times[0] + 60000 - now
        : 0
    );

    if (wait > 0) {
      state.warnings = Math.min(
        100,
        state.warnings + 1
      );

      // 拒否回数も保存するため、ここでは例外を投げない
      tx.set(rateRef, state);

      return limited(warning(state.warnings), {
        kind: 'posting',
        warnings: state.warnings,
        retryAfter: Math.ceil(wait / 1000),
        severe: state.warnings >= 30
      });
    }

    times.push(now);
    tx.set(rateRef, state);

    const profileName = profileSnap.data()?.channelName;

    const author =
      typeof profileName === 'string' && profileName.trim()
        ? profileName.trim().slice(0, 200)
        : 'ユーザー';

    const post = {
      videoId: d.videoId,
      text,
      author,
      authorUid: uid,
      type,
      createdAt: FieldValue.serverTimestamp()
    };

    if (type === 'danmaku') {
      post.videoTime = d.videoTime;
      if (danmakuStyle) post.danmakuStyle = danmakuStyle;
    } else {
      post.parentId = parentId;
      post.editCount = 0;
    }

    tx.create(postRef, post);

    return { ok: true, commentId: postRef.id };
  });
});