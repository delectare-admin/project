# ミュートワードリスト・動画アップロード画面の修正

作成日: 2026年10月26日
対象: delectare-admin/project の fd63aedc011ef057187359b65336f57d9e31eed6 を基準にしたコード

## 変更内容

- 設定の「ミュートワード」の直下に「ミュートワードリスト」を追加します。保存した語句と件数を表示し、1件ずつ「解除」できます。編集中の別の語句は解除操作では消しません。既存と同じ端末・ブラウザ内のアカウント別保存です。
- 動画投稿は、大きなファイル選択エリア → 詳細 → 確認・公開の順になります。PCでは左に詳細、右に動画プレビューを表示します。スマホは縦に並べます。
- サムネイルを点線のタイルから選択し、プレビュー・解除できます。未指定なら既存の自動生成処理を使います。コメント・弾幕等の設定も残しています。
- 公開操作で、従来と同じ認証、App Check、投稿予約、サムネイル送信、動画送信、サーバー検査へ進みます。UIを選択しただけでは公開しません。

YouTube Studioを参考にした画面構成です。収益化、子供向け設定、限定公開など、サーバーにない機能を動作するように見せる表示は追加していません。

## セキュリティの指摘について（未解決の項目があります）

スクリーンショットの X-Content-Type-Options と X-Frame-Options の不足は、現在のGitHub PagesのURLでは、この修正ファイルだけでは解消しません。HTTPレスポンスを設定できる配信環境が必要です。

`SECURITY-HEADERS-NOTES.md` と `deployment/security-headers.firebase.example.json` は、そのための確認資料・設定例です。今のサイトを別の配信先へ自動で移したり、Firebaseへデプロイしたりはしません。設定例をいきなり公開すると、承認ドメインやアップロードのCORS設定が足りず機能が止まる可能性があるため、先にノートの確認が必要です。

今回の変更箇所は、ユーザー入力をHTMLとして組み立てず、既存CSPのスクリプトハッシュを更新しました。許可ドメインは増やしていません。サイト全体や公開中のサーバーが無条件に安全だと保証するものではありません。

## 1. ZIPを展開する

`submovie-upload-settings-20261026.zip` を展開し、中の `install-upload-settings.cjs` を、普段の `project` フォルダーにコピーしてください。

次の場所にファイルがある状態にします。ダウンロードしたZIPの中を開いているだけでは実行できません。

```text
C:\Users\anima\OneDrive\デスクトップ\project\install-upload-settings.cjs
```

`review` フォルダーは確認用の完成コードです。ここからindex.htmlだけをコピーすると必要なCSS・JavaScriptが不足するので、次のインストーラーでまとめて適用してください。

## 2. 事前確認（まだ変更しません）

VS CodeのPowerShellで実行します。

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"
Test-Path .\install-upload-settings.cjs
node .\install-upload-settings.cjs --dry-run
```

`True` と `事前確認OK: 6ファイル。まだ変更していません。` が通常の結果です。一部が適用済みなら対象件数は減ります。全部適用済みなら「適用済みです」と表示します。

「対象コードが一致しません」の場合は停止してください。手元の変更を守るための停止です。その表示を送ってください。無理にindex.htmlを上書きしないでください。

## 3. 適用する

```powershell
node .\install-upload-settings.cjs
```

適用前に、`project` の隣の `submovie-upload-settings-backups` フォルダーへ元ファイルを保存します。表示されるバックアップのパスを控えてください。処理途中の書き込み失敗時は、書き換えたファイルを元に戻すようにしています。

対象は次の6ファイルだけです。他の編集・サーバー・Firestore/Storageルールを変更しません。インストーラーはネットワーク通信、npm、Git、Firebaseの操作を実行しません。

1. `index.html`
2. `assets/upload-settings-v1.mjs`
3. `assets/upload-settings-v1.css`
4. `deployment/security-headers.firebase.example.json`
5. `SECURITY-HEADERS-NOTES.md`
6. `UPLOAD-SETTINGS-README.md`

## 4. GitHubへ保存・公開する

まず差分を確認します。

```powershell
git status -sb
git diff --stat -- index.html
```

その後、今回の6ファイルだけをコミット・プッシュします。他に移動・削除したファイルがあっても、このコマンドには含めません。

```powershell
git add -- index.html assets/upload-settings-v1.mjs assets/upload-settings-v1.css deployment/security-headers.firebase.example.json SECURITY-HEADERS-NOTES.md UPLOAD-SETTINGS-README.md
git commit --only -m "ミュートワードリストと動画投稿画面を改善" -- index.html assets/upload-settings-v1.mjs assets/upload-settings-v1.css deployment/security-headers.firebase.example.json SECURITY-HEADERS-NOTES.md UPLOAD-SETTINGS-README.md
git push origin main
```

今回のUI修正にはFirebase Functionsやルールの再デプロイは不要です。GitHub Actionsの公開完了後、サイトを再読み込みしてください。セキュリティヘッダーの設定例は、この操作では適用されません。

## 5. 公開後の確認

PCとスマホで次を確認してください。

- 設定 → ミュートワードリストに保存済みの語句が表示され、1件ずつ解除できる。
- アカウントを切り替えると、そのアカウントの保存内容が表示される。
- PCの作成メニュー、スマホのマイページの投稿ボタンから、新しい投稿画面が開く。
- 動画、タイトル、説明、サムネイルを設定し、「次へ」で確認画面へ進む。「戻る」で編集を続けられる。
- 「保存して公開」を押した時だけ送信を開始する。小さいテスト動画で、従来どおり検査完了後に再生できる。

今回のテストは同梱の `VERIFICATION.md` に記載しています。ローカルのブラウザテストではFirebase通信を模擬しており、実際のアカウント・課金・本番投稿は操作していません。

## 元に戻す場合

インストール時に表示されたバックアップのパスを指定してください。下のパスは例なので、実際のものに置き換えます。

```powershell
node .\install-upload-settings.cjs --restore "C:\Users\anima\OneDrive\デスクトップ\submovie-upload-settings-backups\20261026-実際の文字列"
```

適用後に対象ファイルをさらに編集していた場合は、その編集を消さないよう復元を停止します。復元後も、公開サイトへ反映するには同じ6ファイルを確認してGitへコミット・プッシュする必要があります。追加したファイルは復元で削除されるため、そのときの `git add --` はファイル削除も記録します。
