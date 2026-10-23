'use strict';

// This index is server-only. A creator sees only subscribers who opted in.
function createSubscriberDirectory({db, FieldValue, FieldPath, HttpsError, now = Date.now}) {
  const validUid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  const fail = message => { throw new HttpsError('invalid-argument', message); };
  const millis = value => {
    const result = value?.toMillis?.() ?? (value instanceof Date ? value.getTime() : NaN);
    return Number.isFinite(result) ? result : 0;
  };
  const privateRef = uid => db.doc('userPrivate/' + uid);
  const relationRef = (uid, channel) => db.doc('userPrivate/' + uid + '/subscriptions/' + channel);
  const indexRef = (uid, channel) => db.doc('creatorLabSubscribers/' + channel + '/items/' + uid);
  function checkKeys(data, allowed) {
    if (!data || Object.keys(data).some(key => !allowed.includes(key))) fail('操作の項目を確認してください。');
  }
  async function syncOne(uid, channel) {
    if (!validUid(channel) || uid === channel) return;
    await db.runTransaction(async tx => {
      const [profile, relation] = await Promise.all([tx.get(privateRef(uid)), tx.get(relationRef(uid, channel))]);
      const row = relation.data(), at = millis(row?.updatedAt);
      if (profile.data()?.showInSubscriberList === true && row?.active === true && at > 0 && at <= now() + 60000) {
        tx.set(indexRef(uid, channel), {subscribedAt: row.updatedAt, indexedAt: FieldValue.serverTimestamp()});
      } else tx.delete(indexRef(uid, channel));
    });
  }
  async function call(uid, data) {
    if (!validUid(uid)) throw new HttpsError('unauthenticated', 'ログインしてください。');
    if (data.op === 'subscriberVisibility') {
      checkKeys(data, ['op', 'visible']);
      if (Object.hasOwn(data, 'visible')) {
        if (typeof data.visible !== 'boolean') fail('表示設定を確認してください。');
        await privateRef(uid).set({showInSubscriberList: data.visible}, {merge: true});
      }
      const value = await privateRef(uid).get();
      return {ok: true, visible: value.data()?.showInSubscriberList === true};
    }
    if (data.op === 'syncSubscriberCard') {
      checkKeys(data, ['op', 'channelUid']);
      if (!validUid(data.channelUid) || data.channelUid === uid) fail('登録先を確認してください。');
      await syncOne(uid, data.channelUid); return {ok: true};
    }
    if (data.op === 'syncSubscriberCards') {
      checkKeys(data, ['op', 'cursor']);
      if (data.cursor != null && !validUid(data.cursor)) fail('ページ位置を確認してください。');
      let query = db.collection('userPrivate/' + uid + '/subscriptions').orderBy(FieldPath.documentId()).limit(50);
      if (data.cursor) query = query.startAfter(data.cursor);
      const page = await query.get(); let next = 0;
      async function worker() {
        while (next < page.docs.length) { const row = page.docs[next++]; await syncOne(uid, row.id); }
      }
      await Promise.all(Array.from({length: Math.min(4, page.docs.length)}, worker));
      return {ok: true, next: page.size === 50 ? page.docs.at(-1).id : null};
    }
    if (data.op === 'recentSubscribers') {
      checkKeys(data, ['op', 'cursor']);
      if (data.cursor != null && !validUid(data.cursor)) fail('ページ位置を確認してください。');
      const collection = db.collection('creatorLabSubscribers/' + uid + '/items');
      let query = collection.where('subscribedAt', '>=', new Date(now() - 90 * 86400000))
        .orderBy('subscribedAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(5);
      if (data.cursor) {
        const cursor = await indexRef(data.cursor, uid).get();
        if (!cursor.exists) fail('一覧を更新してから、もう一度お試しください。');
        query = query.startAfter(cursor);
      }
      const page = await query.get(), subscribers = [];
      for (const item of page.docs) {
        const viewer = item.id;
        if (!validUid(viewer) || viewer === uid) continue;
        const [preferences, relation, profile, stats] = await db.getAll(
          privateRef(viewer), relationRef(viewer, uid), db.doc('users/' + viewer), db.doc('channelStats/' + viewer)
        );
        const subscribedAt = millis(relation.data()?.updatedAt), indexedAt = millis(item.data()?.subscribedAt);
        // Recheck current consent and subscription: stale index entries never disclose a private subscription.
        if (preferences.data()?.showInSubscriberList !== true || relation.data()?.active !== true
            || subscribedAt !== indexedAt || subscribedAt < now() - 90 * 86400000
            || subscribedAt > now() + 60000 || !profile.exists) continue;
        const publicData = profile.data(), count = stats.data()?.count;
        subscribers.push({uid: viewer,
          channelName: typeof publicData.channelName === 'string' ? publicData.channelName.slice(0, 200) : 'ユーザー',
          avatarUrl: typeof publicData.avatarUrl === 'string' ? publicData.avatarUrl.slice(0, 4096) : '',
          subscribedAt,
          subscriberCount: Number.isSafeInteger(count) && count >= 0 ? count : 0});
      }
      return {ok: true, subscribers, next: page.size === 5 ? page.docs.at(-1).id : null};
    }
    fail('操作を確認してください。');
  }
  return {call};
}

module.exports = {createSubscriberDirectory};
