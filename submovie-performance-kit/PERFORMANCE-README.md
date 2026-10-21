# サブ・ムービー 読み込み改善セット

対象: https://delectare-admin.github.io/project/  
確認した公開ソース: `a9b908a14f656defb57e27d28046b2be933482f8`。この版と異なるローカル変更があれば、インストーラーは上書きせず停止します。

## 何を直したか

| 対象 | 変更 |
| --- | --- |
| ホーム | 最初は24本。下へ進むと追加取得。追加ボタンも利用可能 |
| 一覧の取得 | サーバー作成の新着順カタログを利用。準備前はStorageの24件取得へ自動的に戻る |
| 動画のURL | 全動画分を先に取得せず、実際に再生する元動画だけ取得 |
| 検索・カテゴリ・登録チャンネル等 | 必要時は残りの一覧も取得し、初回24本以外も対象にする |
| 動画への直接リンク | 一覧全件を待たず対象動画の情報を取得して再生開始 |
| JavaScript | 検索用・HLS用ライブラリを必要時に取得。既存の固定バージョン・SRI検証を維持 |
| iPhone等のHLS対応ブラウザ | スマホで対応していればブラウザ内蔵HLS再生を利用し、HLS用ライブラリの取得を省く |
| 通常コメント | 最初は親コメント20件を描画。「さらにコメントを表示」で20件ずつ追加 |
| 弾幕 | 準備後は再生位置付近の約65秒分を購読。シーク時も取得範囲を変更 |
| 動画配信 | 元動画を残し、144・240・360・480・720pのHLSを生成。存在する画質だけ選択可能 |
| バックアップ | 適用前のファイルをプロジェクトの外へ自動保存。復元機能付き |

**通常コメントの通信は、並び替え・返信・固定・ブロックを維持するため、対象動画の通常コメントを取得します。20件なのは最初の描画数です。通常コメントの通信まで20件になったわけではありません。**

弾幕と通常コメントの分離は、古いコメントの種類の補完とインデックス準備後に有効になります。未準備・権限エラー・インデックス不足時は従来の取得方式へ戻して表示を維持します。

カタログ未準備時のStorage一覧は名前順のページ取得なので、全動画中の正確な新着順を初回24件で保証できません。カタログが完成すると新着順になります。

現行コードには以前のHLSバッファ制限と弾幕描画の軽量化が残っていました。今回の主な不足は、一覧の全件取得・全元動画URLの先行取得と、新しい動画に複数画質の配信データを作る処理です。

## 最初に：PC内のファイルへ適用する

`install-site-performance.cjs` を、`index.html` のある `project` フォルダーに保存します。ファイル名が `.cjs.txt` にならないようにしてください。

VS CodeのPowerShellで、まず事前確認だけ実行します。

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"
node .\install-site-performance.cjs --dry-run
```

`事前確認OK` が出たら適用します。

```powershell
node .\install-site-performance.cjs
```

インストーラー自体はネット通信・npm実行・Firebaseデプロイ・Git操作をしません。すべての元ファイルの照合とJavaScript構文・CSPハッシュの確認が済んでから変更します。WindowsのCRLF/BOMにも対応しています。

バックアップ先は、`project` の一つ上に作る `submovie-performance-backups\20261022-…` です。今回変更した元ファイルを保存します。PCを買い替える場合などは、このフォルダーも別ドライブにコピーしてください。

`対象コードが一致しません` と出た場合は、そのまま止めてください。Gitの変更を消して無理に合わせる必要はありません。最新の `index.html` とエラー全文を確認してから差分を合わせます。

## 1. サイト側をGitHubへ反映

バックエンド準備前でも、一覧の分割取得・URLの取得削減・ライブラリの遅延取得・コメント描画数の制限は利用できます。

```powershell
git add -- index.html assets/site-performance-v1.mjs _config.yml PERFORMANCE-README.md
git commit --only -m "一覧と再生開始の読み込みを軽量化" -- index.html assets/site-performance-v1.mjs _config.yml PERFORMANCE-README.md
git push origin main
```

GitHubのActionsで最新コミットのPages公開が完了したことを確認します。PCは `Ctrl + F5`、スマホは再読み込みして確認してください。`Everything up-to-date` は、新しい変更がまだコミットされていない場合にも出ます。

`index.html` だけでなく **`assets/site-performance-v1.mjs` も必ず公開**してください。以前の `optimize-index.cjs` 等をこの後にもう一度実行すると、この修正を上書きする可能性があるので再実行しないでください。

## 2. Firestoreルールを反映

今回は元のルールを保ち、公開用カタログの読み取りと、内部処理用データの拒否だけを追加しました。Storageルールは変更不要です。

```powershell
firebase deploy --only firestore:rules --config .\firebase.security.json --project testo-movie-site
```

`--only firestore:rules` を省略しないでください。ここではFunctionsやStorageルールの一括デプロイは行いません。

## 3. 弾幕取得用のインデックスを追加

[Google Cloud Shell](https://console.cloud.google.com/cloudshell/editor?project=testo-movie-site) で実行します。このコマンドは必要なインデックスを一つ追加し、既存のインデックスを削除しません。

```bash
gcloud firestore indexes composite create \
  --project=testo-movie-site \
  --database='(default)' \
  --collection-group=comments \
  --query-scope=collection \
  --field-config=field-path=videoId,order=ascending \
  --field-config=field-path=type,order=ascending \
  --field-config=field-path=videoTime,order=ascending
```

既に存在する場合は作り直し不要です。完成まで数分以上かかることがあります。準備中は従来の弾幕取得へ戻ります。既存インデックスを空の設定ファイルで置き換える必要はありません。

## 4. 新しい配信処理をデプロイ

### Node.jsの条件

PCの `node -v` が `v24.22.1` になっていることと、Firebase上の実行環境の更新は別です。

この追加処理は、実際の実行環境が **22.23.4以上／24.22.1以上／26.12.1以上の対応系統**になるまで、動画取得・変換・バックフィルを開始しません。未修正版では `streaming_runtime_patch_required` を記録して終了します。Functions自体の起動やSDK読み込みまでなくなるわけではなく、サイト全体のNode.js更新を代行する仕組みでもありません。

先ほど提供されたGuardのログは22.23.2でした。このPC内の更新だけでは、その関数が修正版になったとは判断できません。修正版がGoogleから提供される前に、安全判定の下限を下げて回避しないでください。今回のフロント改善は先に利用できます。

### PowerShell

```powershell
npm --prefix .\streaming-server\functions ci --ignore-scripts
Push-Location .\streaming-server
firebase deploy --only functions:streaming --project testo-movie-site
Pop-Location
```

新規の `streaming` コードベースだけを対象にします。`anti-spam` や `thumbnails` をこのコマンドで置き換えません。Node.js 22指定に対しPCが24なので `EBADENGINE` 警告が出ることがあります。インストールが正常終了したかも確認してください。

FFmpeg/FFprobeはGoogle側のビルドで取得します。Windowsで `build-media-tools.cjs` を実行する必要はありません。固定した8.1.3の配布物のSHA-256と実行バージョンを照合し、不一致なら停止します。上記のPC側の `npm ci` では、依存パッケージのインストールスクリプトを実行しません。Google側では通常のnpmビルドと指定した `gcp-build` が実行されます。

リージョンは既存の動画バケットに合わせて **us-east1**、バケットは `testo-movie-site.firebasestorage.app` です。初回にAPIやサービスアカウントの準備を求められる場合があります。権限エラーは全文を確認して対処し、バケットを全員書き込み可能にしたり、広範な管理者権限を追加したりしないでください。

コンテナの保存日数を尋ねられた場合は `1` などの**日数の数字**を入力します。ここへ `cd` やデプロイコマンドを入力しないでください。

### 既存動画にも適用される

定期処理が30分ごとに動き、既存動画も100件ずつカタログへ登録し、未変換の動画を順に処理します。既存の単一画質HLSも対象です。新規投稿だけに限定していません。

最初の実行を早める場合は、[Cloud Scheduler](https://console.cloud.google.com/cloudscheduler?project=testo-movie-site) で `submovieStreamMaintenance` を含むジョブを選び、「今すぐ実行」を一度だけ使用します。修正版Node.js未提供ならここでも処理を開始しません。

カタログが一巡すると `performanceStatus/catalog.ready`、古いコメントの種類の補完が終わると `performanceStatus/comments.ready` が `true` になります。手動でこれらを `true` にしないでください。

変換が完成すると元動画のメタデータに `streamProfile=adaptive-v1` と `hlsUrl` が付きます。すでに開いているページは再読み込みし、動画を開き直してください。

## 5. 残りのコードもGitHubへ保存

デプロイ成功後に実行します。

```powershell
git add -- firestore.rules notification-server/firestore-security.rules streaming-server
git commit --only -m "配信用HLS生成と公開カタログを追加" -- firestore.rules notification-server/firestore-security.rules streaming-server/.gitignore streaming-server/firebase.json streaming-server/functions/index.js streaming-server/functions/service.cjs streaming-server/functions/media-plan.cjs streaming-server/functions/media-tools.cjs streaming-server/functions/build-media-tools.cjs streaming-server/functions/package.json streaming-server/functions/package-lock.json
git push origin main
```

`node_modules`、`.media-bin`、秘密鍵、認証情報はコミットしないでください。追加した `.gitignore` が生成物を除外します。`_config.yml` でもバックエンドをPages公開対象から除外しています。

## 変換の範囲・料金

今回の自動変換は、まず **512MiB以下・20分以下・縦横4096px以下**の元動画を対象にしています。投稿そのものの既存上限（256GB・12時間）を変更するものではありません。対象外や変換失敗の動画は、従来のHLS／元動画で再生できます。

- 元動画の解像度以下で144・240・360・480・720pを用意します。低解像度動画は拡大しません。
- 4秒単位のHLS。H.264＋音声があればAAC。動画15秒分程度の先読み設定は維持します。
- 通常のHLS.js自動再生はPCで最大720p、スマホ・データ節約モードで最大360p。手動選択も可能。iPhone等の内蔵HLSではブラウザが自動選択し、手動画質切替が利用できない場合があります。
- 全ユーザー合計で1日最大10回の変換開始、同時変換1件、同じ動画は最大3回の試行。1回のFFmpeg実行は最大6分、出力最大768MiB・2000ファイルです。
- 出力ファイルは元動画の世代別に分離し、すべて揃ってから公開します。変換中の削除・置き換えやメタデータの競合を検査します。
- 元動画は残します。配信用ファイルも保存するため保存容量・変換CPU・Firestore操作・Scheduler・転送には料金が生じ得ます。**回数制限は請求額の上限ではありません。**

今回確認した公開動画6本には、HLSがない動画1本と単一画質HLSの動画5本がありました。全動画を一度に再ダウンロードして検査することはしていません。上の条件に合う動画から変換されます。

初期設定では大規模サービス並みの大量・長時間動画の即時変換は目指していません。動画数が増えたら、検索専用インデックス、通常コメントのサーバー側ページ取得、専用トランスコード基盤、CDNを次段階で検討してください。GitHub Pagesの応答ヘッダーやGoogle側ランタイムの配布時期はHTMLだけでは制御できません。

## 検証したこと・していないこと

- PC・スマホ相当のブラウザで検索、一覧追加取得、直接リンク、評価、返信入力保持、ゲスト再生、App Check付き投稿経路、CSPを確認。
- 96本のテスト一覧で初回24本、一覧のための元動画URL取得0回。検索すると24本以外も対象になることを確認。
- 通常コメント55件のテストで件数を維持し、初回20件→40件を描画。弾幕はシークで購読範囲を更新。
- 実際のFFmpeg8.1.3で横720p・縦動画・低解像度音声なし動画を変換し、H.264/AAC・解像度・再生リストを確認。
- Firestoreエミュレーターで既存の評価者UID非公開、連投制限迂回の禁止、通知等を含むルール51項目を確認。内部ジョブへの利用者の読み書きも拒否。
- 変換処理の同時実行、公開前の削除、更新前提条件、回数上限、旧コメント補完を実際のFirestoreエミュレーターで確認。
- 新規バックエンドの固定依存関係は確認時の `npm audit --omit=dev` で既知の報告0件。これはサイト全体やFFmpegに未知の脆弱性がないという保証ではありません。

**公開サイトへのデプロイと、本番回線での秒数・通信量の測定はこのファイル作成時点では未実施です。** 何倍速くなった等の数値は保証しません。

## 戻す場合

インストール直後に表示された自分のバックアップ先へ置き換えて実行します。

```powershell
node .\install-site-performance.cjs --restore "C:\Users\anima\OneDrive\デスクトップ\submovie-performance-backups\20261022-表示された文字列"
```

これはPC内のファイルを戻す操作です。適用後にさらに編集していれば、消さずに停止します。GitHubやFirebaseへ反映した内容は自動的には戻りません。戻したファイルの確認・再コミット等が別途必要です。新しい変換を止めるには、まずCloud Schedulerでこのセットの定期ジョブを一時停止し、必要に応じて `streaming` の関数だけを停止・削除します。既存のGuardやサムネイル関数は削除しないでください。

同梱の `submovie-source-backup-a9b908a.zip` は確認時点の公開リポジトリ57ファイルのコピーです。あなたのPCの未公開変更、動画本体、Firestoreデータ、秘密鍵のバックアップではありません。動画・データベースのバックアップは別途必要です。

## 参考（公式資料）

- [Storageのページ取得](https://firebase.google.com/docs/storage/web/list-files)
- [Firestoreのカーソル](https://firebase.google.com/docs/firestore/query-data/query-cursors)
- [インデックス追加コマンド](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/indexes/composite/create)
- [Node.js 2026年10月セキュリティ更新](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Googleのランタイム更新](https://docs.cloud.google.com/functions/docs/runtime-support)
- [FFmpeg配布・ソース](https://ffmpeg.org/download.html)／[セキュリティ情報](https://ffmpeg.org/security.html)
