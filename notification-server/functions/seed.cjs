const core = require('./core.cjs');

async function main() {
  const [files] = await core.bucket.getFiles({
    prefix: 'videos/'
  });

  for (const file of files) {
    if (!/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) {
      continue;
    }

    const video = await core.saveVideo(file);
    if (!video) continue;

    const key = core.statsKey(file.name);

    const stats = await core.db.doc(
      `videoStats/${key}`
    ).get();

    if (stats.exists) {
      await core.emit(
        video.uid,
        'likes',
        key,
        video,
        stats.data().likes || 0
      );
    }

    console.log('[VIDEO]', file.name);
  }

  const channels = await core.db
    .collection('channelStats')
    .get();

  for (const channel of channels.docs) {
    await core.emit(
      channel.id,
      'subscribers',
      channel.id,
      null,
      channel.data().count || 0
    );
  }

  const comments = await core.db
    .collection('comments')
    .where('type', '==', 'danmaku')
    .get();

  for (const comment of comments.docs) {
    await core.recordDanmaku(
      comment.id,
      comment.data()
    );
  }

  console.log('通知の初期登録が完了しました。');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});