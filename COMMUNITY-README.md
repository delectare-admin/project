# 視聴済みバー・コメントのハート・ホーム登録中・ラボ改善

対象サイト: https://delectare-admin.github.io/project/
確認したGitHubコミット: a842557682b4907409016331185d95ac1bbdb2de（2026年10月23日）

## 今回変わること

- PC・スマホのホームと関連動画のサムネイル下端に、赤い視聴済みバーを表示します。再生中は約5秒ごと、一時停止・移動・終了時にも保存します。短い動画の視聴完了にも対応します。
- 視聴位置はこのブラウザ内に、ログインアカウントごとに保存します。別端末・別ブラウザとの同期はありません。保存を禁止したブラウザでは、その画面を開いている間だけ保持します。
- 動画の投稿者が、再生画面の通常コメント・返信にハートを付けたり取り消したりできます。他の視聴者には投稿者のアイコン付きハートを表示します。ラボの既存ハート機能とも共通です。
- ホームの「登録中」は、登録チャンネルの動画だけを混ぜて表示します。同じ投稿者ばかり続かないようにします。ホームの登録中を選び直すと並びが変わります。コレクションのチャンネル一覧・絞り込みは既存のままです。
- ラボの「最近の動画」の各行に余白を追加します。
- ラボに「最近のチャンネル登録者」を追加します。PCでは最近の動画の右、スマホでは下に表示します。5件ずつ追加できます。名前・アイコンから、その人のチャンネルへ移動できます。

## 最近の登録者が表示される条件（重要）

登録情報の非公開を保つため、初期設定は「表示しない」です。

登録者本人が、マイページなどから「設定」→「登録先への表示」→「登録先の投稿者に、自分のチャンネル名とアイコンを表示する」をオンにすると対象になります。

- 現在も登録中で、登録情報の更新日が過去90日以内の人だけを表示します。
- 以前からの登録も、本人がオンにすると登録データを確認して反映します。日付が存在しない古いデータは推測で補いません。
- 表示するのはチャンネル名・アイコン・公開のチャンネル登録者数だけです。メールアドレス・他の登録先・ブロック設定は返しません。
- オフにしたり登録解除した人は、索引が一時的に残っていても、取得時の再確認で除外します。
- 最初は空の表示になることがあります。人数や登録者を架空に補うことはありません。

## 1. ZIPを展開して、インストーラーを置く

ZIPを「すべて展開」してください。中にある次のファイルを、PCのprojectフォルダ直下へコピーします。

`install-community-features.cjs`

置く場所は次です。thumbnail-serverの中ではありません。

`C:\Users\anima\OneDrive\デスクトップ\project\install-community-features.cjs`

インストーラーはネット接続・npm・Firebase・Gitを実行しません。既存ファイルを全て照合し、変更前にバックアップを作ります。コードが一致しない場合は、何も変更せず停止します。

## 2. 事前確認して適用する（PCのPowerShell）

以下をまとめて実行してください。`--dry-run`は確認だけですが、次の通常実行まで含めています。

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

if (-not (Test-Path -LiteralPath .\install-community-features.cjs -PathType Leaf)) {
    throw "展開した install-community-features.cjs を、このprojectフォルダへコピーしてください。"
}

node .\install-community-features.cjs --dry-run
if ($LASTEXITCODE -ne 0) { throw "事前確認に失敗しました。変更せず停止しました。表示内容を送ってください。" }

node .\install-community-features.cjs
if ($LASTEXITCODE -ne 0) { throw "適用結果を確認してください。ここで停止します。" }
```

`更新しました`・`追加しました`と、バックアップ先が表示されればPC内の適用完了です。バックアップはprojectの隣の `submovie-community-backups` に保存します。表示された保存先を控えてください。

「対象コードが一致しません」が出た場合は、現在のファイルに別の変更があります。強制上書きせず、その表示を送ってください。

## 3. Firestoreルールを公開する（PCのPowerShell）

新しい表示設定を保存できるように、先にルールを公開します。Storageルールは今回変更しません。

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

firebase deploy --only firestore:rules --config .\firebase.security.json --project testo-movie-site
if ($LASTEXITCODE -ne 0) { throw "Firestoreルールの公開に失敗しました。ここで停止してください。" }
```

`Deploy complete!` を確認して次へ進みます。全文は `review/firestore.rules` にも含めています。

## 4. ラボのFunctionsだけ更新する（PCのPowerShell）

既存のApp Check・ログイン確認を持つ `submovieCreatorLab` を更新します。動画検査関数・サムネイル生成関数・動画アップロード用関数のデプロイは不要です。

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

node --check .\anti-spam-server\functions\creator-lab.cjs
if ($LASTEXITCODE -ne 0) { throw "構文エラーを確認してください。" }
node --check .\anti-spam-server\functions\subscriber-directory.cjs
if ($LASTEXITCODE -ne 0) { throw "構文エラーを確認してください。" }

npm --prefix .\anti-spam-server\functions ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw "依存関係の準備に失敗しました。" }

$communityPreviousTimeout = $env:FUNCTIONS_DISCOVERY_TIMEOUT
Push-Location .\anti-spam-server -ErrorAction Stop
try {
    $env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"
    firebase deploy --only "functions:anti-spam:submovieCreatorLab" --project testo-movie-site
    if ($LASTEXITCODE -ne 0) { throw "ラボ関数のデプロイに失敗しました。" }
} finally {
    Pop-Location
    if ($null -eq $communityPreviousTimeout) {
        Remove-Item Env:FUNCTIONS_DISCOVERY_TIMEOUT -ErrorAction SilentlyContinue
    } else {
        $env:FUNCTIONS_DISCOVERY_TIMEOUT = $communityPreviousTimeout
    }
}
```

`Deploy complete!` を確認して次へ進みます。ローカルNode.js 24とクラウドNode.js 22の違いによるEBADENGINE警告だけなら、上記の終了コードで成否を確認してください。新しいnpm依存パッケージは追加していません。

## 5. GitHubへ保存する（PCのPowerShell）

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

$communityFiles = @(
    'index.html',
    'assets/creator-lab-v1.mjs',
    'assets/watch-progress-v1.mjs',
    'assets/community-features-v1.mjs',
    'assets/community-features-v1.css',
    'anti-spam-server/functions/creator-lab.cjs',
    'anti-spam-server/functions/subscriber-directory.cjs',
    'firestore.rules',
    'notification-server/firestore-security.rules',
    'COMMUNITY-README.md'
)

git add -- $communityFiles
if ($LASTEXITCODE -ne 0) { throw "ファイルの追加に失敗しました。" }

git diff --cached --quiet -- $communityFiles
$communityDiffExit = $LASTEXITCODE
if ($communityDiffExit -eq 1) {
    git commit --only -m "視聴済みバーとハート・登録中・ラボを改善" -- $communityFiles
    if ($LASTEXITCODE -ne 0) { throw "コミットに失敗しました。" }
} elseif ($communityDiffExit -ne 0) {
    throw "Gitの差分確認に失敗しました。"
}

git push origin main
if ($LASTEXITCODE -ne 0) { throw "GitHubへの送信に失敗しました。" }
```

GitHub Actionsの公開完了後、PCはCtrl+Shift+R、スマホはページを読み込み直してください。

## 6. サイトで確認する

1. 動画を数秒見て一時停止し、ホームへ戻る。サムネイル下に赤い視聴済みバーが出る。
2. 別の動画を開き、関連動画に先ほどの動画があれば同じバーが出る。
3. ホームの「登録中」を押す。ホームのままで登録先の動画が出る。コレクションを押すと従来のチャンネル一覧へ移る。
4. 自分の動画の通常コメント・返信にハートボタンが出る。クリックで追加・取り消しでき、別の視聴者からは表示だけになる。
5. ラボで最近の動画に余白があり、最近の登録者がPCは右、スマホは下にある。
6. 登録者本人が表示設定をオンにすると、その人の情報がラボの最近の登録者へ反映される。オフにすると次の取得では表示されない。

## セキュリティと適用範囲

- コメントのハートはStorage上の動画所有者とコメントの動画IDを、既存サーバー処理が検証します。画面のボタンを隠すだけの制限ではありません。
- 登録者索引はブラウザからの直接読み書きを拒否します。サーバーは認証UID本人のチャンネルについてのみ情報を返し、返すたびに表示許可・現在の登録状態・日時を再確認します。
- 新しい登録者APIも既存のApp Check・匿名ログイン拒否・操作回数制限を通ります。
- 動的な文字はtextContentで描画し、画像URLはHTTPSを確認します。インラインスクリプトを変えたため、CSPのSHA-256も更新しています。
- 今回追加する第三者ライブラリ、アクセス解析、外部への視聴履歴送信はありません。
- `thumbnail-server` の自動修復設定やアップロード検査コードは今回の更新対象に含めていません。
- `review/` に変更差分と更新ファイルの全文を同梱しています。npmのテスト用依存関係・テスト用アカウント・クラウド認証情報は同梱していません。
- 検証の範囲と本番未確認事項は `VERIFICATION.md` を参照してください。

## PC内の変更を戻す場合

適用時に表示された実際のバックアップ先を指定します。下の `実際の名前` は、表示されたフォルダ名に置き換えてください。

```powershell
node .\install-community-features.cjs --restore "C:\Users\anima\OneDrive\デスクトップ\submovie-community-backups\20261023-実際の名前"
```

この操作はPC内の今回のファイルだけを戻します。FirebaseやGitHubは自動で戻しません。更新後に別の編集がある場合は、その編集を消さないよう停止します。

新しい表示設定を保存した後は、古いFirestoreルールが新しい設定項目を受け付けなくなります。UIだけ戻す場合は、公開済みの今回のルールを保ち、古いルールをそのまま再公開しないでください。

## 参考にした公式資料

- https://firebase.google.com/docs/functions/callable
- https://firebase.google.com/docs/firestore/security/test-rules-emulator
- https://firebase.google.com/docs/firestore/query-data/index-overview
