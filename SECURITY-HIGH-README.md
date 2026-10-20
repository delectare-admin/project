# セキュリティ優先度「高」3件の更新・バックアップ手順

対象: https://delectare-admin.github.io/project/  
確認した公開コード: `26a138214320f51a6b33ee69c3c36120da83eb37`（2026年10月20日）

## 今回の変更

|対象|変更内容|
|---|---|
|動画の投稿|1本256GB（256,000,000,000バイト）・12時間以内。YouTubeの公表している上限に合わせました。既存の1日10件の投稿予約制限は維持します。|
|ファイル形式|拡張子とMIMEを予約時に確認し、保存後にもFFprobeで映像・時間を確認、FFmpegで1フレームを読み取ります。拡張子だけをMP4に変えた実行ファイルや、音声だけのファイルは公開しません。|
|公開までの流れ|4MiBずつサーバーへ送信→非公開の `video-uploads/` に保存→検査→合格したものを従来の `videos/` へ公開。投稿セッションのURLはサーバー専用のFirestore文書に保存し、ブラウザへ渡しません。|
|FFmpeg|`ffmpeg-static` が取得していた6.1.1を外し、BtbNのFFmpeg/FFprobe 8.1.3 LGPLビルドを固定して使用。Cloud Build時に配布ファイル全体のSHA-256を照合し、一致しなければ停止します。|
|Firestore|通常コメント・返信・弾幕の直接作成と本文の直接編集を拒否。従来の認証付き `submovieGuard` を通すため、連投制限と編集5回までの制限を迂回できなくします。|
|既存の機能|既存動画の閲覧、タイトル等の編集、固定、削除、返信、弾幕カスタマイズ、通知、登録チャンネル、検索、スマホの配色を維持。動画の編集・固定もサーバー経由に変更しています。|

この検査は「形式・容量・動画としての読み取り・コンテナが示す長さ」の検査です。全フレームの検査、ウイルスの完全検出、再エンコードによる無害化、YouTubeの全機能を再現するものではありません。ブラウザが再生できないコーデックは、従来どおり変換が必要になることがあります。

**料金について:** 256GBは許容する最大値で、通常の投稿に勧める容量ではありません。保存容量・通信・Functionsの料金は発生します。今回のサーバー中継は、未検査ファイルを公開させないためのものです。Base64は使いませんが、動画の直接アップロードよりFunctionsの呼び出しが増えます。検査後に一時ファイルを削除しても、バケットのSoft Deleteが有効なら、その保持期間分の容量料金がかかります。

## 1. 最初にバックアップを保存

今回こちらで `submovie-backup-20261020.zip` を作成しました。公開リポジトリの全37ファイルと、Gitの履歴全体が入っています。ZIPの破損検査と、Gitの履歴を復元できることを検証済みです。パソコンにダウンロードし、外付けドライブなどにもコピーしてください。

**含まれないもの:** あなたのPCでまだGitHubへ送っていない変更、Firestoreのコメントやユーザー設定、Firebase Authenticationのアカウント、Storageの動画・画像、Firebaseコンソールだけで変更した公開中のルール、クラウドの権限設定。

以前の更新ファイルが作ったTempフォルダーのバックアップは、一部ファイルの退避です。サイトとFirebase全体の定期バックアップが有効であるとは、こちらでは確認できません。

さらに、Firebaseコンソールの次の2つを**変更前にそれぞれ全文コピーし、プロジェクトの外へ保存**してください。

- Firestore Database → ルール
- Storage → ルール

今回のルールは公開コードに合わせた完全版です。**現在コンソールで公開中の全文は取得できていません。独自に追加した機能用のルールがある場合は、今回のファイルと照合してから公開してください。**

## 2. 更新ファイルを実行

`install-security-high.cjs` を `index.html` と同じ `project` フォルダーに保存します。PowerShellで、まず変更できるかを確認します。

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"
node .\install-security-high.cjs --dry-run
```

「事前確認OK」と出たら、適用します。

```powershell
node .\install-security-high.cjs
```

必要なファイルをまとめて更新・追加します。元のファイルは、**projectの外側**にできる `submovie-security-backups` フォルダーへ保存します。画面に正確なバックアップ先が出ます。更新ファイルはネット通信、npmの実行、Firebaseのデプロイ、Gitの送信を自動では行いません。

「対象コードが一致しません」「未確認のファイルがあります」と出た場合、何も上書きせず止まります。現在のコードを保持するための動作なので、無理に回避せず、その表示を送ってください。

## 3. Functionsを更新

以下を**ひとまとまりずつ**実行します。失敗したら次へ進まず、そのエラーを確認してください。

```powershell
npm --prefix .\anti-spam-server\functions ci
Push-Location .\anti-spam-server
firebase deploy --only functions:anti-spam --project testo-movie-site
Pop-Location
```

```powershell
npm --prefix .\thumbnail-server\functions ci
Push-Location .\thumbnail-server
firebase deploy --only functions:thumbnails --project testo-movie-site
Pop-Location
```

更新される主な関数は次のとおりです。

- `submovieGuard`: 従来の関数。東京リージョンのままです。
- `submovieUploadChunk`: 新規。投稿データを受け取る米国東部のHTTP関数です。毎回Firebaseのログインを検証します。
- `submovieValidateUpload`: 新規。動画検査用。バケットと同じ `us-east1` です。
- `submovieAutoThumbnail` / `submovieThumbnailBackfill`: 既存のサムネイル関数。新しいFFmpegを使います。

FFmpegの取得・SHA-256確認はクラウドのビルド時に自動実行します。Windowsで `build-media-tools.cjs` を手動実行する必要はありません。Cloud Buildの配布元への通信が失敗したり、ハッシュが一致しなかったりした場合は、安全側に停止します。

`FUNCTIONS_DISCOVERY_TIMEOUT=60` のような初期化タイムアウト対策が必要な環境では、再実行前にPowerShellで `$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"` と設定できます。エラーの原因が不明なまま、関数を削除しないでください。

## 4. Firestore / Storageルールを公開

更新後のプロジェクトには、次の完全版が入ります。差分の継ぎ足しは不要です。

- `firestore.rules`
- `storage.rules`
- `notification-server/firestore-security.rules`（古いルールに戻らないよう同じ内容へ更新）

手順1で保存した公開中のルールとの照合を済ませたら、projectフォルダーで実行します。

```powershell
firebase deploy --only "firestore:rules,storage" --config firebase.security.json --project testo-movie-site
```

Functionsやルールを更新してから画面側を公開します。更新の途中では新規投稿が一時的に使えないことがあります。新旧の投稿処理が混在しても、検査前の動画を公開しないための制限です。

**重要:** Storageルールでは、ブラウザによる `videos/` の新規保存・上書き・削除を拒否します。動画を削除・編集する機能は更新済みFunctionsを使います。古い画面を開きっぱなしの利用者は再読み込みが必要です。

## 5. GitHubへ送信

projectフォルダーで実行します。他の削除ファイルや作業中のファイルを混ぜないよう、今回のファイルだけを指定します。

```powershell
$securityFiles = @(
  'index.html',
  'firestore.rules',
  'storage.rules',
  'firebase.security.json',
  'SECURITY-HIGH-README.md',
  'notification-server/firestore-security.rules',
  'anti-spam-server/functions/index.js',
  'anti-spam-server/functions/upload-policy.cjs',
  'anti-spam-server/functions/video-metadata.cjs',
  'anti-spam-server/functions/upload-chunk.cjs',
  'thumbnail-server/functions/index.js',
  'thumbnail-server/functions/package.json',
  'thumbnail-server/functions/package-lock.json',
  'thumbnail-server/functions/.gitignore',
  'thumbnail-server/functions/build-media-tools.cjs',
  'thumbnail-server/functions/upload-policy.cjs',
  'thumbnail-server/functions/video-metadata.cjs'
)
git add -- @securityFiles
git diff --cached --stat
git commit --only -m "投稿検査と容量上限・FFmpeg・コメントルールを更新" -- @securityFiles
git push origin main
```

GitHub Actionsが成功したら、サイトを再読み込みしてください。更新後は、小さな自分のMP4を1本投稿し、公開されること、既存動画の再生・編集、通常コメント・返信・弾幕が動くことを確認します。

`.media-bin`、バックアップZIP、バックアップフォルダー、認証情報はGitHubへ追加する必要はありません。**以前のインストーラーを再実行すると、古いコードが戻る場合があります。今回の更新後は使い回さないでください。**

## Firebaseのデータもバックアップする

こちらにはFirebaseの管理者として操作する接続がないため、以下の設定はまだ実行していません。

### Firestore: 毎日の自動バックアップ

Google Cloudコンソールで `testo-movie-site` を選び、Firestoreのデータベース一覧 → `(default)` の「スケジュールされたバックアップ」→ 設定の編集から、「毎日」、保存期間「7日」などを選びます。バックアップと復元には料金がかかります。

Firebase CLIでも設定できます。既存スケジュールがあるか先に確認します。

```powershell
firebase firestore:backups:schedules:list --database "(default)" --project testo-movie-site
```

毎日のスケジュールがない場合に、次を一度だけ実行します。

```powershell
firebase firestore:backups:schedules:create --database "(default)" --recurrence DAILY --retention 7d --project testo-movie-site
```

設定できても、その瞬間にバックアップ完了とは限りません。コンソールで実際にバックアップが作成された日付を確認してください。復元先は新しいデータベースになるため、復元時には接続先やルールの確認も必要です。

### Storage: 動画・画像の保護と別コピー

Google Cloudコンソール → Cloud Storage → `testo-movie-site.firebasestorage.app` → 保護の設定で、**Soft Deleteの保持期間が7日以上か確認**します。削除・上書き事故から戻すための保護です。保存容量に応じて料金がかかります。今回の一時アップロードも削除後しばらく保持されるため、その分の料金も含まれます。

Soft Deleteは独立したバックアップではありません。重要な動画の元ファイルは、PCと外付けドライブにも保存してください。クラウドで別コピーを作る場合は、公開を許可していない別のバックアップ専用バケットへコピーし、その料金と容量を確認してください。

### Authentication: アカウントは別に保存

FirestoreのバックアップにFirebase Authenticationのアカウントは含まれません。必要な場合は、プロジェクトの外側へエクスポートします。

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Documents\submovie-private-backup"
firebase auth:export "$env:USERPROFILE\Documents\submovie-private-backup\auth-20261020.json" --format=json --project testo-movie-site
```

このファイルにはアカウント情報が含まれます。GitHubには置かず、パソコンの保護された場所や暗号化された保存先で保管してください。

## 確認したことと限界

- Firebaseエミュレーター: 59件。コメント直接投稿・直接編集の拒否、本人だけの操作、票の操作、通知、登録処理、非公開投稿、Storageの上書き拒否、画像の容量上限など。
- サーバー処理: 16組。容量の境界値、形式拒否、認証、予約の再試行、10件制限、セッションURLの非公開、動画編集、コメント・弾幕の制限、分割送信の範囲など。
- 実際のFFmpeg/FFprobe 8.1.3: MP4・MOV・WebMの解析とフレーム生成。動画でないファイル・音声だけのファイル・12時間超の解析結果は公開しないことを確認。
- 配布ファイル: 約137MBのアーカイブ全体のSHA-256、必要な実行ファイルだけの展開、実バージョンを確認。改変ファイルは展開・実行前に拒否するテストも実施。
- PC/スマホのブラウザ: 投稿→検査待ち→再生の一連の動作をモックで確認。既存の検索、登録チャンネル、配色の回帰テストとCSP検証。
- 更新後のサムネイル関数のnpm依存: 検査時点の既知の脆弱性0件。

本番のFirebaseへのデプロイ、実バケットでの投稿、256GBファイルの実送信、12時間の実動画全体、Windows実機での実行はまだ確認していません。クラウド側のIAMや現在公開中のルール全文も未取得です。これらを確認せず「完全に安全」「本番適用済み」とは言えません。

## 元へ戻す場合

更新ファイルが表示したバックアップ先を使います。

```powershell
node .\install-security-high.cjs --restore "画面に表示されたバックアップフォルダー"
```

このコマンドはPC内の今回のファイルだけを戻します。更新後にそのファイルをさらに編集している場合は、上書きせず停止します。**FirebaseのFunctions・公開中のルール・GitHubは自動では戻りません。** 古い直接投稿を許すルールに戻すと、今回の対策も失われます。デプロイ後に問題が出た場合は、まずエラーを確認してから対処してください。

## 参照した一次資料

- YouTubeの上限: https://support.google.com/youtube/answer/71673?hl=ja
- FFmpegのセキュリティ修正: https://ffmpeg.org/security.html
- 使用したビルド: https://github.com/BtbN/FFmpeg-Builds/releases/tag/autobuild-2026-09-30-13-08
- 配布元のビルド・保持方針: https://github.com/BtbN/FFmpeg-Builds
- Cloud Storageの再開可能アップロード: https://docs.cloud.google.com/storage/docs/resumable-uploads
- Firestoreのバックアップ: https://firebase.google.com/docs/firestore/backups
- StorageのSoft Delete: https://docs.cloud.google.com/storage/docs/soft-delete
