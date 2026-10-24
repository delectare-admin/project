# PC全画面の弾幕入力・動画操作と自動非表示

対象サイト: https://delectare-admin.github.io/project/
基準コミット: 0276926da962b0a273659dd31f405fc4b42640d7

## 今回の変更

PCでサイトの全画面ボタンを押すと、下部に次を表示します。

カスタマイズ → 弾幕入力 → 弾幕送信 → 高評価 → 低評価 → 共有 → その他メニュー

シークバー、音量、画質・速度設定、PiP、全画面解除は従来の操作を使います。下部の弾幕・評価欄の上に配置します。

- 入力欄やボタンを複製せず、既存の要素とイベント処理を全画面中だけ移動します。
- 全画面を解除すると、元の位置へ戻します。未送信の弾幕は残します。
- カスタマイズ、共有、その他メニュー、未ログイン案内も全画面内で表示できます。
- カーソルがプレーヤー外へ出たときやウィンドウが非アクティブになったときは、操作欄・設定・カスタマイズ・その他メニューを閉じます。
- 映像上で約2.5秒操作しない場合も、操作欄とカーソルを隠します。カーソルを動かすと再表示します。
- 弾幕入力中、操作欄や開いたメニューにカーソルを置いている間、キーボードで操作している間は、無操作タイマーで隠しません。画面外への離脱時は閉じても下書きは残します。
- Tabキーで操作を始めたときも操作欄を表示します。
- 弾幕の映像上の表示は、そのまま残します。ブラウザのEsc案内・終了UIや拡張機能による表示は、サイトの操作欄とは別です。

通常のPC再生画面、スマホの配置・標準全画面、既存のPiP配置は維持します。

## 変更する4ファイル

- index.html
- assets/desktop-fullscreen-v1.mjs
- assets/desktop-fullscreen-v1.css
- FULLSCREEN-README.md

Firebaseルール・Functions・依存パッケージの変更はありません。Firebaseの再デプロイは不要です。

## 1. ZIPを展開する

ZIPを「すべて展開」し、中にある install-desktop-fullscreen.cjs を次へコピーします。

C:\Users\anima\OneDrive\デスクトップ\project\install-desktop-fullscreen.cjs

thumbnail-serverなどの中ではなく、projectフォルダ直下です。

VS Codeで編集中のindex.htmlがあれば、先にCtrl+Sで保存してください。

## 2. 事前確認して適用する（PCのPowerShell）

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

if (-not (Test-Path -LiteralPath .\install-desktop-fullscreen.cjs -PathType Leaf)) {
    throw "展開した install-desktop-fullscreen.cjs を、このprojectフォルダ直下へコピーしてください。"
}

node .\install-desktop-fullscreen.cjs --dry-run
if ($LASTEXITCODE -ne 0) { throw "事前確認に失敗しました。変更せず停止しました。表示内容を送ってください。" }

node .\install-desktop-fullscreen.cjs
if ($LASTEXITCODE -ne 0) { throw "適用結果を確認してください。ここで停止します。" }
```

--dry-runは確認だけです。上記は、その後の通常実行も続けて行う手順です。

事前にすべての対象ファイルを照合し、元ファイルと一致しなければ何も変更せず止まります。不一致時は強制上書きせず、表示内容を送ってください。

適用前のバックアップは、projectの隣の submovie-fullscreen-backups に作ります。表示された保存先を控えてください。

インストーラーはネット接続、npm、Firebase、Gitを実行しません。Node.jsの標準機能だけで照合、構文確認、バックアップ、適用を行います。

## 3. GitHubへ保存する（PCのPowerShell）

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

$fullscreenFiles = @(
    'index.html',
    'assets/desktop-fullscreen-v1.mjs',
    'assets/desktop-fullscreen-v1.css',
    'FULLSCREEN-README.md'
)

git diff --stat -- $fullscreenFiles

git add -- $fullscreenFiles
if ($LASTEXITCODE -ne 0) { throw "ファイルの追加に失敗しました。" }

git diff --cached --quiet -- $fullscreenFiles
$fullscreenDiff = $LASTEXITCODE
if ($fullscreenDiff -eq 1) {
    git commit --only -m "PC全画面に弾幕入力と動画操作を追加し自動非表示を調整" -- $fullscreenFiles
    if ($LASTEXITCODE -ne 0) { throw "コミットに失敗しました。" }
} elseif ($fullscreenDiff -ne 0) {
    throw "Gitの差分確認に失敗しました。"
}

git push origin main
if ($LASTEXITCODE -ne 0) { throw "GitHubへの送信に失敗しました。" }
```

GitHub Actionsの公開完了後、PCでCtrl+Shift+Rを押して再読み込みします。

## 4. サイト上で確認する

1. PCで動画を開き、全画面ボタンを押す。
2. 下部にカスタマイズ・弾幕入力・送信・高評価・低評価・共有・その他が並ぶ。
3. カスタマイズや共有、その他メニューが開く。設定内の操作で動画が勝手に再生・停止しない。
4. 弾幕入力を始めると、入力中は操作欄を維持する。送信にはこれまでと同じログイン・連投制限を使う。
5. 入力欄からフォーカスを外し、カーソルを映像上で動かさず約2.5秒待つと、サイトの操作欄が消える。動かすと戻る。
6. 別モニターなどプレーヤー外へカーソルを移すと、操作欄と開いた設定が閉じる。
7. 全画面を解除すると、各操作が元の位置へ戻り、未送信の下書きが残る。
8. 通常画面・スマホ・ホーム閲覧用PiPが従来どおり使える。

## セキュリティと実装範囲

- 認証、App Check、連投制限、評価UIDの非公開、Firestore・Storageルールを変更しません。
- 評価・送信・保存・通報などの既存ボタンと処理を移す方式です。全画面専用の書き込み経路や、クライアントからの直接書き込みを追加しません。
- 新しい外部ライブラリ、外部アクセス解析、視聴情報送信は追加しません。
- 新しいモジュールはDOMと表示状態を扱います。利用者の文字列をHTMLとして挿入しません。
- インラインJavaScriptを調整したため、CSPのSHA-256を再計算しています。script-srcにunsafe-inlineやunsafe-evalは追加しません。
- 全画面はブラウザの正式なAPIを使い、非対応時は既存の疑似全画面を使います。Escなどの終了手段を妨げる処理は追加しません。
- インストーラーは不一致ファイルやリンクを上書きしません。書き込み失敗時には元へ戻します。

review/changes.patch に全差分、review/に更新コードの全文、VERIFICATION.md に検証結果と範囲を含めています。

参考にした公式資料:
- https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide
- https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen

## PC内の変更を戻す

適用時に表示された実際のバックアップ先を指定します。

```powershell
node .\install-desktop-fullscreen.cjs --restore "C:\Users\anima\OneDrive\デスクトップ\submovie-fullscreen-backups\20261024-実際の名前"
```

更新後に別の編集がある場合は、その変更を消さないよう停止します。これはPC内の復元です。公開サイトへ反映するには、復元後に対象ファイルの追加・削除を確認してコミット・プッシュしてください。Firebaseへの復元操作は不要です。
