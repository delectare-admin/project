# PCのPiP配置を調整する

確認した基準コード: delectare-admin/project の 37c254423399749957afb1fcc76cd36cddab50cc
対象: https://delectare-admin.github.io/project/

## 変更内容

1. PC再生画面の操作を左から「設定」「手動PiP（別ウィンドウ）」「IキーのPiP（ホーム閲覧用）」にします。既存のボタンとイベント処理を移動し、機能は維持します。
2. ホーム閲覧用ミニプレーヤーは、戻るボタンを左上、閉じるボタンを右上にします。
3. 別タブ・別サイトの上にも出るDocument PiPには、動画の左上に「再生画面に戻る」ボタンを追加します。対応ブラウザでは、右上の標準の「タブに戻る」を非表示にする正式なオプションを使います。ブラウザがオプションを無視する場合、標準ボタンが残ることがあります。
4. 左上の戻るボタンは、動画のURLを設定し直さずに再生画面へ戻し、移動時の再生位置を復元します。別の動画へ変わった後に古いURLや画面へ戻さないよう、動画IDと再生世代を確認します。

スマホの操作ボタン配置・標準動画PiPの処理は既存のままです。Firebaseルール・Functions・依存パッケージの変更やデプロイはありません。

## 黒い帯について

画像で囲まれていた、サイト名・閉じるボタンがある上端の黒い帯は、ブラウザ側が表示元を知らせるUIです。Document PiPには表示元を明示する安全上の要件があり、サイトのCSSでブラウザの帯を消したり左右を並べ替えたりするAPIはありません。この帯は残します。

右上の戻るボタンについては、DocumentPictureInPicture.requestWindow() の disallowReturnToOpener オプションを使い、サイト側の左上の戻るボタンに置き換えます。これはブラウザ側の表示ヒントなので、全ブラウザで非表示になることを保証するものではありません。

Document PiPを使えず標準動画PiPへ切り替わるブラウザでは、小窓の枠や戻るボタンの位置はブラウザ管理です。その位置は変更しません。映像の縦横比による余白も、映像を切り取らないため維持します。

参考:
- https://developer.chrome.com/docs/web-platform/document-picture-in-picture
- https://wicg.github.io/document-picture-in-picture/#origin-visibility

## 1. ZIPを展開してインストーラーを配置

ZIPを「すべて展開」してください。

中の install-pip-layout.cjs を、次のprojectフォルダ直下へコピーしてください。

C:\Users\anima\OneDrive\デスクトップ\project\install-pip-layout.cjs

VS Codeで編集中のindex.htmlがあれば、先にCtrl+Sで保存します。

## 2. 事前確認して適用（PCのPowerShell）

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

if (-not (Test-Path -LiteralPath .\install-pip-layout.cjs -PathType Leaf)) {
    throw "展開した install-pip-layout.cjs を、このprojectフォルダ直下へコピーしてください。"
}

node .\install-pip-layout.cjs --dry-run
if ($LASTEXITCODE -ne 0) { throw "事前確認に失敗しました。表示内容を送ってください。" }

node .\install-pip-layout.cjs
if ($LASTEXITCODE -ne 0) { throw "適用結果を確認してください。ここで停止します。" }
```

--dry-runだけでは変更しません。上は、事前確認と通常実行を続けて行う手順です。

更新対象は index.html と、この PIP-LAYOUT-README.md です。既存コードと一致しない場合は変更前に停止します。強制上書きはしません。

元ファイルのバックアップは、projectの隣の submovie-pip-layout-backups に作ります。表示された保存先を控えてください。

インストーラーはネット接続・npm・Firebase・Gitを実行しません。Node.jsの標準機能だけで照合、バックアップ、構文確認、書き込みを行います。

## 3. GitHubへ反映（PCのPowerShell）

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

$pipLayoutFiles = @('index.html', 'PIP-LAYOUT-README.md')
git diff -- index.html

git add -- $pipLayoutFiles
if ($LASTEXITCODE -ne 0) { throw "ファイルの追加に失敗しました。" }

git diff --cached --quiet -- $pipLayoutFiles
$pipLayoutDiff = $LASTEXITCODE
if ($pipLayoutDiff -eq 1) {
    git commit --only -m "PCのPiPと設定ボタンの配置を調整" -- $pipLayoutFiles
    if ($LASTEXITCODE -ne 0) { throw "コミットに失敗しました。" }
} elseif ($pipLayoutDiff -ne 0) {
    throw "差分確認に失敗しました。"
}

git push origin main
if ($LASTEXITCODE -ne 0) { throw "GitHubへの送信に失敗しました。" }
```

GitHub Actionsの公開完了後、PCでCtrl+Shift+Rを押して再読み込みします。

## 4. サイトで確認

- PCの動画下の操作が「設定 → 手動PiP → IキーのPiP」になる。
- 設定を開き、これまでどおり再生速度や画質を操作できる。
- Iキーでホーム閲覧用小窓を開き、戻るが左上、閉じるが右上にある。戻ると同じ動画の画面へ復帰する。
- 手動PiPを開き、動画へカーソルを入れると左上の戻るボタンが出る。キーボードでフォーカスしたときも表示する。
- 別ウィンドウから戻っても、動画の位置と一時停止状態を維持する。
- ブラウザの×で別ウィンドウを閉じても、動画が元の位置へ戻る。
- スマホの設定ボタンの位置が従来どおりである。

## セキュリティと確認範囲

- 不明な外部スクリプトや拡張機能を導入しません。
- 戻るボタンのアイコンは、サイト内の既存SVGを複製します。利用者の入力をHTMLとして実行しません。
- ブラウザの表示元UIを隠す回避策は使いません。標準の戻るボタンを隠すための正式なオプションだけを使います。
- インラインJavaScriptを変更するため、CSPのSHA-256ハッシュも再計算しています。unsafe-inlineやunsafe-evalをscript-srcへ追加しません。
- 認証・App Check・Firestore・Storageのルールやアップロード検査処理を変更しません。
- review/changes.patch に全差分、VERIFICATION.md に検証結果と制約を同梱しています。
- 本番サイトへのプッシュやデプロイは行っていません。

## PC内の変更を戻す

実際に表示されたバックアップ先を指定します。

```powershell
node .\install-pip-layout.cjs --restore "C:\Users\anima\OneDrive\デスクトップ\submovie-pip-layout-backups\20261023-実際の名前"
```

更新後に別の編集があれば、その編集を消さないよう停止します。この復元はPC内だけです。公開サイトへ戻すには、復元したindex.htmlをコミット・プッシュしてください。
