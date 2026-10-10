const {
  onDocumentWritten,
  onDocumentCreated
} = require('firebase-functions/v2/firestore');

const core = require('./core.cjs');

const options = {
  region: 'us-east1',
  retry: true,
  minInstances: 0,
  maxInstances: 3
};

// 動画の高評価
exports.notifyVideoLikes = onDocumentWritten(
  {
    ...options,
    document: 'videoStats/{key}'
  },
  async event => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const count = after.data().likes || 0;

    const before = event.data.before.exists
      ? (event.data.before.data().likes || 0)
      : 0;

    if (count <= before) return;

    const video = await core.resolveVideo(
      event.params.key
    );

    if (!video) return;

    await core.emit(
      video.uid,
      'likes',
      event.params.key,
      video,
      count
    );
  }
);

// チャンネル登録者数
exports.notifySubscribers = onDocumentWritten(
  {
    ...options,
    document: 'channelStats/{uid}'
  },
  async event => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const count = after.data().count || 0;

    const before = event.data.before.exists
      ? (event.data.before.data().count || 0)
      : 0;

    if (count <= before) return;

    await core.emit(
      event.params.uid,
      'subscribers',
      event.params.uid,
      null,
      count
    );
  }
);

// 弾幕投稿
exports.notifyDanmaku = onDocumentCreated(
  {
    ...options,
    document: 'comments/{id}'
  },
  async event => {
    if (!event.data) return;

    await core.recordDanmaku(
      event.params.id,
      event.data.data()
    );
  }
);