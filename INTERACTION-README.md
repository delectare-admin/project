# 評価・投稿の応答とスマホ全画面の修正

2026年10月22日版。確認元は `delectare-admin/project` のコミット `5bf0656b8a126154d34cf9a11ea7572dd344bfce` です。公開ページの `index.html` とGit上の内容が一致することも確認しました。

## 変更する内容

- PC・スマホ：動画と通常コメントの評価は、タップ直後に選択色・件数を仮反映します。保存中は同じ対象への重複操作を防ぎ、拒否・通信エラー時は確認済みの状態へ戻します。リアルタイム更新と重なっても二重加算しません。
- コメント・返信：送信した本文と「送信中…（まだ保存は完了していません）」をすぐ表示します。失敗した場合は本文を残し、既存の警告を入力欄の近くに表示します。
- 弾幕：自分の画面で送信直後から薄く仮表示します。サーバー側で確認した同じ弾幕が届いたら1件に統合し、失敗時は仮表示を取り消します。他の利用者へ届くのはサーバーが受理した投稿だけです。
- サーバー：Storageの動画設定確認とFirestoreの独立した読み取りを並行します。設定の確認が成功するまで、コメント・制限記録・評価を保存しません。権限を古いキャッシュで判定する変更はありません。
- 返信先はサーバーのトランザクション内で再検証するため、同じ確認のために行っていた画面側の追加通信を削除します。返信の保存中に一覧が更新された場合も、送信状態と下書きを正しく引き継ぎます。
- 投稿にはユーザーごとのリクエストIDを使い、同じリクエストが再送されても二重投稿しないようにします。古いクライアントの投稿も引き続き受け付けます。
- スマホ：全画面ボタンは動画の標準全画面を優先します。iPhoneでは `webkitEnterFullscreen()`、対応する他のブラウザでは動画要素のFullscreen APIを使用します。ページ内拡大だけでタブが残る状態には戻しません。
- ホーム：動画カードの区切り線をライト・ダークの両方で削除します。動画一覧のページ分割や検索・登録中の機能は維持します。

### 速度と全画面の範囲

見た目の反応は保存完了より先に出ますが、保存が完了したことにはしません。実際の保存時間は通信、Cloud Functionsの起動、データベースの場所・混雑に左右され、必ず何秒以内になるという保証はありません。本番のクラウド設定や実測ログにはアクセスしていないため、「2秒のすべてがこのコードのせい」とは断定していません。

常時待機インスタンスを増やす有料設定は自動では追加しません。間隔を空けた最初の操作だけが特に遅い場合は、Cloud Functionsの起動時間を別途調べる余地があります。

iPhoneの標準全画面ではブラウザのURL欄・タブが隠れますが、**弾幕とサイト独自の操作パネルは表示されません**。再生・シーク・音量などは端末／ブラウザ標準の操作を使用します。サイト独自の画質・弾幕設定などは全画面を閉じて操作してください。PCはプレーヤー全体の全画面を維持します。未対応環境では全画面を開始できなかった旨を表示します。

## 1. ZIPを一度展開する

`submovie-interaction-fix-20261022.zip` を展開し、**`install-interaction-fix.cjs` だけ**を普段の `project` フォルダーへコピーします。ZIPの中に別のZIPはありません。`review/` は差分確認用で、そのまま上書きする必要はありません。

## 2. 事前確認

VS Codeで `project` を開き、PowerShellで実行します。

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"
Test-Path .\install-interaction-fix.cjs
node .\install-interaction-fix.cjs --dry-run
```

`True` と「事前確認OK: 6ファイル。まだ変更していません。」が出れば、次へ進めます。既に適用済みの場合や一部の内容が同じ場合、変更数は少なくなります。

対象コードが一致しない・未確認のファイルがある、と出た場合は停止してください。確認していない編集を上書きしないための仕組みです。エラーの全文と現在の対象ファイルを確認してから対応します。

## 3. 適用

```powershell
node .\install-interaction-fix.cjs
```

対象は次の6ファイルです。

```text
index.html
assets/interaction-feedback-v1.mjs
assets/interaction-feedback-v1.css
anti-spam-server/functions/index.js
anti-spam-server/functions/rating-service.cjs
INTERACTION-README.md
```

元のファイルは `project` の隣の `submovie-interaction-backups\20261022-...` に保存します。インストーラーは通信やFirebaseデプロイ、Git操作をしません。変更前後の内容と構文・CSPを照合し、途中で書き込みに失敗した場合は元へ戻します。

## 4. Firebaseの関数を先に更新する

同じPowerShellで実行します。既存のApp Check設定とパッケージ構成を使います。

```powershell
npm --prefix .\anti-spam-server\functions ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw "依存関係の準備に失敗しました。" }

Push-Location .\anti-spam-server
try {
    firebase deploy --only functions:anti-spam --project testo-movie-site
    if ($LASTEXITCODE -ne 0) { throw "Functionsのデプロイに失敗しました。" }
} finally {
    Pop-Location
}
```

**`Deploy complete!` が出てから次へ進んでください。** `npm warn EBADENGINE` だけの場合は、ローカルNode.js 24とクラウド実行環境Node.js 22の違いによる警告です。最後にエラーが出ている場合は進めず、結果を確認してください。

Firestoreルール、Storageルール、App Checkのサイトキー／検証モードの変更・評価データの移行は、この修正では必要ありません。サムネイル・動画変換用Functionsも変更しません。

## 5. GitHubへ反映する

変更対象だけを追加します。他のファイルの移動・削除は一緒にコミットしません。

```powershell
git add -- index.html assets/interaction-feedback-v1.mjs assets/interaction-feedback-v1.css anti-spam-server/functions/index.js anti-spam-server/functions/rating-service.cjs INTERACTION-README.md
if ($LASTEXITCODE -ne 0) { throw "ファイルの追加に失敗しました。" }

git commit --only -m "評価と投稿の応答・スマホの全画面を改善" -- index.html assets/interaction-feedback-v1.mjs assets/interaction-feedback-v1.css anti-spam-server/functions/index.js anti-spam-server/functions/rating-service.cjs INTERACTION-README.md
if ($LASTEXITCODE -ne 0) { throw "コミット結果を確認してください。" }

git push origin main
if ($LASTEXITCODE -ne 0) { throw "プッシュ結果を確認してください。" }
```

GitHub Actionsの公開完了後に、PCは `Ctrl + Shift + R`、スマホはページを読み直して確認します。

## 6. 確認する操作

1. 評価を押すと、保存完了より前に色と件数が変わる。もう一度押した解除・低評価への切り替えでも数が二重に増えない。
2. 通常コメント・返信の送信状態が表示される。送信後に入力が空になる。既存の返信件数・10件ごとの追加表示も使える。
3. 弾幕を送ると自分の画面に仮表示され、受理後に同じ弾幕が2つにならない。送信エラー時は仮表示が消え、本文は残る。
4. 連投した場合、これまでの警告が表示される。確認のために大量送信する必要はありません。
5. iPhoneで動画を再生し、全画面ボタンを押して横にする。タブ・URL欄が隠れる。標準全画面を終了すると、サイトの弾幕・独自設定が戻る。
6. ホームの動画カード間に線がなく、ライト／ダークの文字とアイコンを読める。

試験は本番データを変更せずに行いました。変更部分の検証結果と限界は `VERIFICATION.md` にあります。iPhone／Brave実機での確認は利用者側で必要です。

## 元に戻す場合

表示された実際のバックアップ先を使い、`project` で実行します。

```powershell
node .\install-interaction-fix.cjs --restore "C:\Users\anima\OneDrive\デスクトップ\submovie-interaction-backups\20261022-実際の名前"
```

これはPC内のファイルを復元します。FirebaseやGitHubまで更新していた場合は、復元後のFunctionsを手順4でデプロイし、手順5と同じ対象の変更をコミット・プッシュします。適用後に別の編集をしたファイルがあれば、その変更を消さないよう復元を停止します。投稿済みのコメントや評価を削除する処理はありません。

## ホームの線だけをコードで直す場合

今回の修正版にも含めています。全体の修正を適用する場合、追加する必要はありません。

```css
:root #videoGrid .grid-item {
  border-bottom: 0 !important;
}
```

`index.html` の既存CSSの後ろに置く方法もあります。`<style>` の中に追加してください。ほかの画面の区切り線には影響させません。

## 参考資料

- Appleの動画全画面API：https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari
- Firebaseの遅延・起動時間に関する説明：https://firebase.google.com/docs/functions/tips
- Firebase callableの認証・App Check：https://firebase.google.com/docs/functions/callable
