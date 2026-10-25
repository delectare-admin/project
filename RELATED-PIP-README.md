# 関連動画の投稿者名・アイコンと、自動PiPの移動

対象: https://delectare-admin.github.io/project/
基準コミット: 21ad1aeb0140cf25c875a93ba58c8d447ea7ac4a
作成日: 2026年10月25日

## 今回の変更

関連動画の投稿者名を、タイトルと同じ左端にそろえます。PCではサムネイルのすぐ右、スマホではサムネイルの下です。

並び順は、タイトル → 投稿者名 → 小さなアイコンと再生回数・高評価・弾幕数、になります。アイコンはPCで28pxから24px、スマホで36pxから28pxに小さくします。アイコンからのチャンネル移動、タイトル・サムネイルからの再生、視聴済みバー、統計の取得は従来の処理を使います。

PCでスクロールすると現れる、ページ内の自動PiPを移動できるようにします。

1. 自動PiPの映像部分にカーソルを置く。
2. マウスの左ボタンを約2秒押し続ける。
3. 「ドラッグで移動」と表示されたら、押したまま好きな場所へ移動する。
4. ボタンを離すと位置が決まる。

- カーソルを置くだけでは移動を始めません。短いクリックは今までどおり再生・停止です。
- 長押し完了前に8px以上動かすと、移動の開始を取り消します。
- シークバー、再生・音量等の操作ボタンからは移動を開始しません。
- ドラッグを離した際のクリックが、誤って再生・停止を切り替えないようにします。
- 移動中のEscで、今回のドラッグ開始前の位置に戻せます。
- 画面からはみ出さないように位置を制限し、ブラウザの大きさが変わった場合も調整します。
- プレーヤーを元の位置までスクロールして戻すと、通常の大きな再生画面に戻ります。
- 選んだ位置はページを開いている間だけ保持します。ブラウザの保存領域やサーバーへは記録せず、再読み込みすると初期位置へ戻ります。
- スマホの自動PiPの操作は変更しません。

別ウィンドウで開く手動PiPの位置は、OS・ブラウザ側の操作を使います。この変更はページ内の自動PiPを対象にし、外部ウィンドウをサイトから移動する処理は追加しません。

## 変更する4ファイル

- index.html
- assets/related-language-v1.css
- assets/sticky-pip-drag-v1.mjs（新規）
- RELATED-PIP-README.md（新規）

Firebaseのルール・Functions・App Check設定・依存関係の変更はありません。Firebaseの再デプロイは不要です。

## 1. 配置する

1. ZIPを「すべて展開」してください。
2. 展開先の **install-related-pip.cjs** を、次の場所へコピーしてください。

   C:\Users\anima\OneDrive\デスクトップ\project\install-related-pip.cjs

3. VS Codeで編集中のファイルを保存してください。

インストーラー内に必要なコードを含めています。reviewフォルダーを手作業で上書きする必要はありません。npm installも不要です。

## 2. 事前確認と適用（PCのPowerShell）

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

if (-not (Test-Path -LiteralPath .\install-related-pip.cjs)) {
    throw "install-related-pip.cjs を project 直下にコピーしてください。"
}

node .\install-related-pip.cjs --dry-run
if ($LASTEXITCODE -ne 0) { throw "事前確認に失敗しました。適用せず、表示内容を送ってください。" }

node .\install-related-pip.cjs
if ($LASTEXITCODE -ne 0) { throw "適用に失敗しました。表示内容を確認してください。" }
```

`--dry-run`は確認だけです。オプションなしの2回目の実行が適用です。

手元のコードが基準と一致しない場合は、変更前に止まります。強制上書きせず、メッセージを送ってください。

バックアップはprojectの隣の `submovie-related-pip-backups` に作ります。表示された保存先を控えてください。

## 3. GitHubへ保存・公開（PCのPowerShell）

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

$relatedPipFiles = @(
    'index.html',
    'assets/related-language-v1.css',
    'assets/sticky-pip-drag-v1.mjs',
    'RELATED-PIP-README.md'
)

git diff --stat -- $relatedPipFiles

git add -- $relatedPipFiles
if ($LASTEXITCODE -ne 0) { throw "ファイルの追加に失敗しました。" }

git diff --cached --quiet -- $relatedPipFiles
$relatedPipDiff = $LASTEXITCODE
if ($relatedPipDiff -eq 1) {
    git commit --only -m "関連動画の投稿者名を調整し自動PiPを長押し移動に対応" -- $relatedPipFiles
    if ($LASTEXITCODE -ne 0) { throw "コミットに失敗しました。" }
} elseif ($relatedPipDiff -ne 0) {
    throw "Gitの差分確認に失敗しました。"
}

git push origin main
if ($LASTEXITCODE -ne 0) { throw "GitHubへの送信に失敗しました。" }
```

GitHub Actionsの公開完了後、PCでCtrl+Shift+Rを押して再読み込みしてください。スマホもページを再読み込みします。

## 4. サイトで確認する

1. 関連動画の投稿者名がタイトルと同じ左端にそろう。小さくなったアイコンが件数の左にある。
2. PCで動画を開いて下へスクロールし、自動PiPを出す。
3. 映像部分を左ボタンで約2秒押し続け、そのままドラッグする。
4. 離しても再生・停止が勝手に切り替わらない。短いクリック、再生ボタン、シークバーはそのまま使える。
5. ドラッグ中にEscを押すと、移動を取り消せる。
6. 画面の端へ動かしても小窓が外へ消えない。
7. 元の再生画面までスクロールで戻ると、通常の配置・大きさに戻る。
8. 全画面、ホーム閲覧用ミニプレーヤー、別ウィンドウPiP、スマホの従来操作を確認する。

## セキュリティについて

- 新しいモジュールはDOMの位置と操作状態だけを扱います。動画のソース、再生要素、投稿・評価・認証処理を再作成しません。
- 新規の通信、外部ライブラリ、アクセス解析、保存領域への記録、Firebase書き込みは追加しません。
- ドラッグの座標は有限の数値だけを使い、画面内に制限します。利用者入力をHTMLとして解釈しません。
- index.htmlの既存インラインスクリプト本文・CSPを変更しません。同じ配信元の外部モジュールを1本追加し、CSSのバージョンを更新します。
- 自動PiPのときだけ有効にし、全画面・別ウィンドウPiP・ホーム用ミニプレーヤー・スマホを除外します。
- インストーラーは標準のNode.js機能だけを使い、全対象ファイルを事前照合してバックアップします。ネット接続、npm、Firebase、Git操作は行いません。

検証範囲と限界は同梱の `VERIFICATION.md` を参照してください。サイト全体の無脆弱性や、全ブラウザ・全端末での動作を保証するものではありません。本番サイトへのpushやデプロイはこちらでは行っていません。

## PC内の変更を戻す

実行時に表示された実際のバックアップ先を指定します。

```powershell
node .\install-related-pip.cjs --restore "C:\Users\anima\OneDrive\デスクトップ\submovie-related-pip-backups\20261025-実際のフォルダー名"
```

適用後に別の編集がある場合は、その編集を消さないよう復元を停止します。公開済みのサイトも戻すには、復元した差分を確認してコミット・プッシュする必要があります。

## 参考資料

- https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
- https://developer.chrome.com/docs/web-platform/document-picture-in-picture
