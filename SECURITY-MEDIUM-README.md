# 優先度「中」2件：App Checkと評価者UIDの非公開化

対象サイト: https://delectare-admin.github.io/project/  
対象の公開コード: `feae2a681353bae774237eb5e8e2e9699a97fa35`（2026年10月21日確認）

## UIや機能への影響

今回の目的はセキュリティとプライバシーの改善です。画面のHTML・CSSは変更していません。再生、PiP、全画面、弾幕、カスタマイズ、検索、返信、並び替え、チャンネル登録などの見た目・基本操作を維持します。

|変更|利用者への影響|
|---|---|
|動画・通常コメント・返信の評価|高評価数・低評価数、押したボタンの選択表示、切り替え・取り消しを維持します。自分の選択だけを非公開データから読みます。|
|過去の評価|票と件数を移行します。移行中は評価ボタンの操作が一時的に失敗する場合があります。移行完了後は再読み込みします。|
|App Check|通常は裏側で動き、認証パズルは表示されません。追加の通信・検証待ちがあります。未対応の古い画面、Googleの確認通信を遮断する設定、不正利用と判定された通信では、投稿・評価などが拒否される場合があります。|

**「監視 → 実機確認 → 強制」の順番で導入します。** App Checkを登録・強制する前に、コードを置いただけで保護が完成したとは考えないでください。

## 修正した内容

- App CheckをFirestore・Storage・Functionsより先に初期化し、トークンを自動更新します。
- callable Functionsには、強制時の `enforceAppCheck: true` と登録済みアプリIDの確認を追加しています。
- 動画の分割送信にも `X-Firebase-AppCheck` を付け、HTTP関数でAdmin SDKによるトークン検証を行います。
- 評価者リスト `likedUsers` / `dislikedUsers` を、公開の `videoStats` と `comments` から取り除きます。
- 自分の評価を `userRatings/自分のUID/items/評価キー` に保存し、本人以外の読み出しと、ブラウザからの書き込みを禁止します。
- 評価数の変更はログイン済みのFunctionsだけが行います。通信の再試行で票が二重に増減しないようにしています。
- 日別再生数を更新する既存処理が動くよう、そのルールも動画の再生数更新と組にして定義しています。

投稿者・コメント作者の表示に必要なUIDは従来どおり使用します。今回非公開にするのは「誰が何を評価したか」という情報です。

## 1. 変更前のバックアップ

`backup-before-medium-20261021.zip` に、変更前の公開コード全48ファイルを保存しました。Firebase内の動画、コメント、評価、アカウントや、PC内の未公開の変更は含みません。

Firebaseコンソールの公開中のFirestoreルールを全文コピーし、プロジェクト外に保存してください。コンソールだけで追加した独自のルールがある場合は、今回の完全版と照合してから公開してください。

**Firestoreのバックアップを先に作成・確認してください。** 前回の手順で自動バックアップを設定していても、実際にバックアップが作られた日時を確認します。今回の移行処理も、評価者リストと件数をサーバー専用の `ratingMigrationBackups` に退避してから公開フィールドを取り除きます。これはデータベース全体のバックアップとは別です。

## 2. 更新ファイルを実行

`install-security-medium.cjs` を `index.html` と同じprojectフォルダーに置き、PowerShellで実行します。

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"
node .\install-security-medium.cjs --dry-run
```

「事前確認OK」が出たら適用します。

```powershell
node .\install-security-medium.cjs
```

元ファイルをprojectの外側の `submovie-security-backups` へ退避します。想定と違うコードは上書きせず停止し、書き込みに失敗した場合は元へ戻します。ネット通信、デプロイ、npm実行、Git送信は自動で行いません。

## 3. App Checkの公開キーを設定

この登録はFirebase/Google Cloudの管理権限が必要なため、こちらでは実行していません。先に評価データの移行だけ進める場合は、キー未設定の監視モードのまま手順4〜6を進めることもできます。その場合、App Checkはまだ有効になりません。

1. Google Cloudコンソールで `testo-movie-site` を選びます。
2. reCAPTCHA / Fraud DefenseでWebサイト用のreCAPTCHA Enterpriseキーを作ります。**スコアベース**を選び、チェックボックスによる認証は選びません。
3. 許可ドメインは **`delectare-admin.github.io`** です。`https://` や `/project/` は入れません。本番用キーの許可ドメインにlocalhostは追加しません。
4. Firebaseコンソール → App Checkで、現在のWebアプリ（アプリID `1:406733456438:web:60604213408ddd8d470497`）に、reCAPTCHA Enterpriseとその公開サイトキーを登録します。
5. 初めは標準のTTL（1時間）を使い、サービスの強制はまだオンにしません。
6. projectフォルダーで次を実行します。引用符の中を、実際に発行したキーに置き換えます。

```powershell
node .\configure-app-check.cjs --site-key "ここを発行した公開サイトキーに置き換える"
```

これは**公開サイトキー**です。既存のFirebase APIキー（AIzaで始まる値）とは別です。秘密キーやサービスアカウントのJSONをサイトへ書く必要はありません。

キー作成・利用時の無料枠や課金設定はコンソールで確認してください。サイトのプライバシー案内にも、不正利用防止のためGoogle reCAPTCHA Enterpriseを利用することを記載してください。

## 4. FunctionsとFirestoreルールを更新

今回はanti-spamのコードベースだけを更新します。サムネイル用Functionsの再デプロイは不要です。

```powershell
npm --prefix .\anti-spam-server\functions ci
Push-Location .\anti-spam-server
firebase deploy --only functions:anti-spam --project testo-movie-site
Pop-Location
```

次に、projectフォルダーでFirestoreルールを公開します。今回はStorageルールの変更はありません。

```powershell
firebase deploy --only firestore:rules --config firebase.security.json --project testo-movie-site
```

ここから手順6の移行と再読み込みを終えるまで、古い画面からの評価や、まだ移行していない動画・コメントへの評価が失敗する場合があります。過去の評価数は読み出せます。Functionsやルールがエラーになったら、そのまま次に進まず原因を確認してください。

## 5. GitHubへ公開

今回のファイルだけを送信します。すでに別のファイルをステージしていても、このコミットには混ぜません。

```powershell
$mediumFiles = @(
  'index.html',
  'app-check-config.js',
  'configure-app-check.cjs',
  'firestore.rules',
  'notification-server/firestore-security.rules',
  'anti-spam-server/functions/index.js',
  'anti-spam-server/functions/upload-chunk.cjs',
  'anti-spam-server/functions/app-check-gate.cjs',
  'anti-spam-server/functions/app-check-policy.cjs',
  'anti-spam-server/functions/rating-model.cjs',
  'anti-spam-server/functions/rating-service.cjs',
  'anti-spam-server/functions/migrate-ratings.cjs',
  'SECURITY-MEDIUM-README.md'
)
git add -- @mediumFiles
git diff --cached --stat
git commit --only -m "App Checkと評価者情報の非公開化を実装" -- @mediumFiles
git push origin main
```

GitHub Actionsが成功し、新しい `index.html` と `app-check-config.js` が配信されるのを確認します。

## 6. 過去の評価を一度だけ移行

**この操作が終わるまでは、既存データの評価者リストは公開データに残っています。** コード更新だけで過去データが移動するわけではありません。通常コメント・返信の評価も対象です。

管理者としてFirestoreへアクセスできる環境で実行します。`firebase login` とAdmin SDKの認証は別です。パソコンへ新しくツールを入れずに進めるなら、Google Cloudコンソールの **Cloud Shell** が使えます。

`testo-movie-site` を選んでCloud Shellを開きます。**ここからはPowerShellではなく、Cloud Shellのコマンドです。** GitHubへ送信済みのコードを取得します。

```bash
gcloud config set project testo-movie-site
git clone --depth 1 https://github.com/delectare-admin/project.git submovie-medium-20261021
cd submovie-medium-20261021/anti-spam-server/functions
npm ci --ignore-scripts
node migrate-ratings.cjs --dry-run
```

同じ名前のフォルダーをすでに作っている場合は新たにcloneせず、既存フォルダーで `git pull` してから実行してください。

認証情報を取得できない場合は、Cloud Shellで次を実行し、画面の案内で管理者アカウントを選びます。秘密鍵ファイルをダウンロードしてコードへ埋め込む方法は使いません。

```bash
gcloud auth application-default login
```

その後、もう一度dry-runします。公開中のFirestoreルールが今回のファイルと一致することも、Admin SDKで確認します。古いルールのままなら移行を停止します。

確認がエラーなく終わったら、実際に移行します。

```bash
node migrate-ratings.cjs --apply
```

「移行完了」と出たら、PCとスマホでサイトを再読み込みし、以前押した評価が選択済みになること、評価数が保たれること、取り消し・切り替えができることを確認します。

移行は複数の小さなトランザクションに分けます。途中で止まっても、公開フィールドを取り除く前に票の移動を済ませる構成です。同じコマンドを再実行すると途中から確認して続行できます。件数が矛盾しているデータや、移行先に異なる票がある場合は、上書きせず停止します。その場合はエラーを確認してください。

移行にはFirestoreの読み書き料金がかかります。こちらから本番の移行は実行していません。

## 7. App Checkを監視し、PC・スマホで確認

キーを設定して公開した状態で、次を確認します。

- ログアウト状態でもホーム・検索・動画再生が動く。
- ログインして、通常コメント・返信・弾幕・評価・動画投稿が動く。
- PCとスマホのブラウザで、自分の評価の選択表示と取り消しが動く。
- App Checkの指標で、自分の正常な利用が検証済みになっている。

特に、普段使っているスマホのブラウザでも確認してください。Googleの確認通信を遮断する設定では失敗する場合があります。古いタブも再読み込みが必要です。設定直後にキー未設定のまま見える場合は、PCではCtrl+F5で更新し、スマホではサイトのキャッシュを更新して再確認してください。

App Checkは不正なクライアントからの利用を減らす補助対策です。ログイン確認、Firestore/Storageルール、連投制限の代わりにはなりません。また、公開済みの動画ダウンロードURLを知っている人による取得まで、すべて止めるものではありません。

## 8. 確認できたら強制する

実機の動作と指標を確認したら、PCのprojectフォルダーのPowerShellで実行します。

```powershell
node .\configure-app-check.cjs --enforce
Push-Location .\anti-spam-server
firebase deploy --only functions:anti-spam --project testo-movie-site
Pop-Location
```

これで、コメント・評価等のcallable関数と動画分割送信のHTTP関数が、有効なApp Checkトークンと指定アプリIDを必須にします。

続いて、Firebaseコンソール → App Checkのサービスで、**Cloud FirestoreとCloud Storageの強制**を、それぞれ指標と動作を見ながら有効にします。**コードの `--enforce` だけではFirestore/Storageは強制になりません。** Authenticationは今回の強制対象に追加しません。

変更したFunctionsの設定もGitHubへ保存します。

```powershell
git add -- anti-spam-server/functions/app-check-policy.cjs
git commit --only -m "App Checkの強制検証を有効化" -- anti-spam-server/functions/app-check-policy.cjs
git push origin main
```

正常な利用まで拒否されてしまう場合は、Firestore/Storageはコンソールで強制を解除し、Functionsは次を実行して再デプロイすると監視へ戻せます。

```powershell
node .\configure-app-check.cjs --monitor
Push-Location .\anti-spam-server
firebase deploy --only functions:anti-spam --project testo-movie-site
Pop-Location
```

この場合でも、評価者を非公開にするルールとデータの分離は維持します。**評価者リストを公開へ戻す古いルールやコードには戻さないでください。**

## 9. 評価リクエストの古い記録を自動で整理（任意）

二重送信防止の記録は `ratingRequests` に保存し、`expiresAt` に7日後の日時を書きます。実際の自動削除にはFirestoreのTTL設定が必要です。設定していなくても評価処理は動きますが、記録が蓄積します。

Google Cloudコンソール → Firestore → Time-to-liveで、コレクショングループ **`ratingRequests`**、日時フィールド **`expiresAt`** のポリシーを作成します。削除にも料金がかかります。`userRatings` や `ratingMigrationBackups` にこのTTLを設定する必要はありません。

## 検証結果と限界

- 更新・設定スクリプト14項目：変更前の照合、バックアップ、二重適用、失敗時の復元、Windows形式の改行、後からの変更の保護など。
- Firebaseエミュレーター35項目：本人だけの評価読み出し、他人の一覧取得の拒否、公開UIDリストの再追加拒否、直接の評価数変更の拒否、実Firestoreトランザクションでの同時評価、評価移行・再実行、通知・登録・日別再生数など。
- サーバー処理18組：評価の追加・切り替え・取り消し、重複送信、過去の票の引き継ぎ、矛盾したデータの拒否、App Checkの監視・強制、別アプリの拒否など。
- callable / HTTPへの接続：SDKの強制オプション、登録アプリID、ログイン確認の組み合わせをテスト。
- 320票の分割移行：途中の通信失敗を模擬し、元データを保持して重複せず再開できることを確認。
- ブラウザ：PC・スマホの選択表示・切り替え・取り消し、返信入力の保持、アカウント切り替え、ゲスト視聴、App Checkヘッダー付き動画投稿、CSPを確認。
- 元の画面HTML・CSSは一致。プレイヤー等の残り5つのインラインスクリプトも変更していません。
- 更新対象バックエンドのnpm依存検査は、検査時点の既知の脆弱性0件。

Googleから発行する実際のApp Checkトークンを使った本番動作、Firebaseの管理画面の登録・強制、公開データの実移行、Windows/iPhone実機は、こちらでは実施していません。公開中のルール全文とクラウドの権限設定も管理者として取得していません。すべての不正利用を防ぐ保証や、サイト全体の安全性の保証ではありません。

## 更新ファイルをPC内で戻す場合

更新ファイルに表示されたバックアップ先を指定します。

```powershell
node .\install-security-medium.cjs --restore "表示されたバックアップフォルダー"
```

PC内の今回のファイルだけを戻します。後から設定やコードを変更した場合は上書きせず停止します。FirebaseのFunctions・公開中のルール・移行済みデータ・GitHubは自動では戻りません。移行後の本番環境で問題が起きた場合は、古い評価処理へ戻す前に原因を確認してください。

## 追加でいただいた診断結果について（2026年10月21日確認）

- SSL Labs：一覧に表示された8つの接続先はいずれもBでした。HTTPS/TLSの設定を評価します。Firebaseのアクセス権や、評価者UIDの公開までは検査しません。
- Security Headers：Dでした。HTTPレスポンスではCSP、X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policyが未設定と判定されています。HSTSはあります。
- ページ内にはmeta形式のCSPとreferrer設定があります。ただし、metaとHTTPヘッダーは同じではなく、metaでは設定できない保護もあります。スコアに反映されない設定もあるため、Dだけでサイトの全機能が無防備という意味ではありません。
- Observatory：いただいたURLからは、結果の点数・詳細を取得できませんでした。入力するホスト名は `delectare-admin.github.io` とし、`/project/` は含めないでください。

今回のApp Checkと評価者データ分離は、これらの点数を直接改善する変更ではありません。点数が同じでも今回の対策が無意味ということではなく、逆にAでもFirebaseの権限が安全という保証にはなりません。

TLSのサーバー設定はGitHub Pages側が管理しています。また、このリポジトリにHTMLを追加するだけで任意のHTTPレスポンスヘッダーを設定することはできません。ヘッダー制御が必要な場合はFirebase Hosting等への移行を別の作業として検討します。この更新ではホスティング先を変更しません。

診断URL：
- https://www.ssllabs.com/ssltest/analyze.html?d=delectare-admin.github.io
- https://securityheaders.com/?q=https%3A%2F%2Fdelectare-admin.github.io%2Fproject%2F&hide=on&followRedirects=on
- https://developer.mozilla.org/en-US/observatory/

## 一次資料

- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/app-check/cloud-functions
- https://firebase.google.com/docs/app-check/custom-resource-backend
- https://firebase.google.com/docs/cloud-shell
- https://cloud.google.com/docs/authentication/provide-credentials-adc
- https://docs.cloud.google.com/firestore/native/docs/ttl
