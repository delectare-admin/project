# 関連動画の情報表示と、日本語・英語の切り替え

対象: https://delectare-admin.github.io/project/
基準コミット: ad128cc1afd3d6d3fabedfc449910976c6369dc5
作成日: 2026年10月24日

## 変更内容

関連動画に、ホームと同じ形式のチャンネルアイコン・名前・再生回数・高評価数・弾幕数を表示します。PCはサムネイルの右、スマホは下に配置します。アイコンからのチャンネル移動、サムネイル・タイトルからの動画再生、別タブで開く操作、視聴済みバーを使えます。

数値は既存の公開集計と、type=danmaku のコメント件数から取得します。通常コメント数とは区別しています。画面に近づいたカードから取得し、ホームと関連動画で60秒間共有します。取得できなかった数値を0件として表示しません。表示した瞬間の厳密なリアルタイム数値ではありません。

言語は初回にブラウザの最優先言語を使います。日本語なら日本語、それ以外なら英語を表示します。IPアドレスによる国判定ではありません。そのため、海外でもブラウザが日本語の人には日本語を表示します。位置情報や外部の国判定・翻訳サービスへアクセスしません。

設定 → 優先言語から「日本語」「英語」を選び、「言語を適用して再読み込み」を押します。英語画面では Settings → Preferred language です。選択はこのブラウザに保存し、次回以降も優先します。「端末の言語に合わせる」で手動選択を解除します。

- 設定はPC・スマホとも、マイページの設定ボタンから開けます。ログイン中のPCはアイコンのアカウントメニューからも開けます。
- 変更時はページを再読み込みします。再生が終了し、未保存・未送信の入力が失われるため、先に保存してください。設定欄にも案内を表示します。
- ブラウザへの保存を拒否された場合はエラーを表示し、再読み込みしません。
- この設定はブラウザごとです。別端末へのアカウント同期は追加しません。
- ホーム・検索・再生・コメント・弾幕設定・設定・ラボ等の操作表示、日付・数値の表示を切り替えます。
- 投稿された動画タイトル・説明・チャンネル名・コメント・字幕・タグ・チャプター名は自動翻訳しません。内部のカテゴリ値や、投稿・評価の内容も変更しません。
- サーバーやブラウザから返る未登録の技術的なエラーは、診断情報を失わないよう原文を保持します。

## 1. ファイルを配置する

1. ZIPを右クリックして「すべて展開」してください。
2. 展開先の **install-related-language.cjs** をコピーし、次の場所へ貼り付けてください。

   C:\Users\anima\OneDrive\デスクトップ\project\install-related-language.cjs

3. VS Codeで編集中のファイルをすべて保存します。`review` の中身を手作業で上書きする必要はありません。

インストーラーの中に必要なコードが含まれています。npm installや追加のZIP展開は不要です。

## 2. 事前確認と適用（PCのPowerShell）

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

if (-not (Test-Path -LiteralPath .\install-related-language.cjs)) {
    throw "install-related-language.cjs を project 直下にコピーしてください。"
}

node .\install-related-language.cjs --dry-run
if ($LASTEXITCODE -ne 0) { throw "事前確認に失敗しました。適用せず、表示内容を送ってください。" }

node .\install-related-language.cjs
if ($LASTEXITCODE -ne 0) { throw "適用に失敗しました。表示内容を確認してください。" }
```

`--dry-run` は確認だけです。その次の、オプションなしの実行が適用です。

変更前のファイルが基準コードと一致しない場合は、何も変更せず止まります。強制上書きせず、メッセージを送ってください。以前の修正や手元の編集を消さないための確認です。

バックアップは project の隣の `submovie-related-language-backups` に作ります。表示された保存先を控えてください。

## 3. GitHubへ保存・公開（PCのPowerShell）

今回の対象は次の10ファイルです。Functions、Firestore・Storageルール、App Check設定、npm依存関係には変更ありません。**Firebaseのデプロイは不要**です。

```powershell
Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

$relatedLanguageFiles = @(
    'index.html',
    'assets/community-features-v1.mjs',
    'assets/creator-lab-model-v1.mjs',
    'assets/creator-lab-v1.mjs',
    'assets/desktop-fullscreen-v1.mjs',
    'assets/mobile-description-v1.mjs',
    'assets/watch-progress-v1.mjs',
    'assets/site-language-v1.mjs',
    'assets/related-language-v1.css',
    'RELATED-LANGUAGE-README.md'
)

git diff --stat -- $relatedLanguageFiles

git add -- $relatedLanguageFiles
if ($LASTEXITCODE -ne 0) { throw "ファイルの追加に失敗しました。" }

git diff --cached --quiet -- $relatedLanguageFiles
$relatedLanguageDiff = $LASTEXITCODE
if ($relatedLanguageDiff -eq 1) {
    git commit --only -m "関連動画に投稿者と統計を表示し日本語と英語に対応" -- $relatedLanguageFiles
    if ($LASTEXITCODE -ne 0) { throw "コミットに失敗しました。" }
} elseif ($relatedLanguageDiff -ne 0) {
    throw "Gitの差分確認に失敗しました。"
}

git push origin main
if ($LASTEXITCODE -ne 0) { throw "GitHubへの送信に失敗しました。" }
```

GitHub Actionsの公開完了後、PCはCtrl+Shift+Rで再読み込みしてください。スマホはページを再読み込みします。変更したモジュールのURLも更新し、古いキャッシュと混ざりにくくしています。

## 4. サイトで確認する

1. PCで動画を開き、関連動画の右側にアイコン・名前・再生回数・高評価・弾幕数があることを確認する。
2. スマホでも、関連動画のサムネイルの下に同じ情報が表示されることを確認する。
3. 関連動画のアイコンからチャンネルへ移動する。タイトルやサムネイルでは動画が開く。
4. マイページ → 設定 → 優先言語 → 英語 → 適用して再読み込み、で英語表示を確認する。
5. 英語画面で Settings → Preferred language → 日本語、と選んで戻す。
6. 一度選択した言語が再読み込み後にも残ることを確認する。
7. 動画タイトルや自分の投稿本文が変わらないこと、検索カテゴリ・高評価・コメント・弾幕・全画面・PiPが使えることを確認する。

## 安全性について確認した範囲

- 認証、App Check、連投・投稿・編集制限、評価UIDの非公開、Firestore・Storageルールを変更しません。新しい書き込み経路を追加しません。
- 翻訳は同梱辞書で行い、外部CDN・翻訳API・国判定API・アクセス解析・依存パッケージを追加しません。
- 個人の投稿を画面全体の文字列置換にかけません。ソース内の操作文言と、明示的に印を付けた固定UIだけを翻訳します。
- 言語の保存値は ja / en の2種類だけを受け付けます。保存内容をHTMLやスクリプトとして実行しません。
- 関連動画のユーザー入力は既存のエスケープ処理とtextContentを使い、アバターには認証情報を含まないHTTPS URLだけを使用します。
- CSPの許可先を広げず、更新したインラインスクリプトのSHA-256を再計算しました。
- オフラインのインストーラーは、全ファイルを事前照合し、バックアップ・構文確認付きで適用します。不明なコードやリンクを上書きしません。

詳細な検証結果・限界は同梱の `VERIFICATION.md` に記載しています。サイト全体の無脆弱性を保証するものではありません。本番サイトへの変更や実利用者データへの書き込みはこちらでは行っていません。

## PC内の変更を戻す

適用時に表示された実際のバックアップ先を指定します。

```powershell
node .\install-related-language.cjs --restore "C:\Users\anima\OneDrive\デスクトップ\submovie-related-language-backups\20261024-実際のフォルダー名"
```

適用後に別の編集がある場合は、その編集を消さないよう復元を拒否します。GitHubに公開済みの場合、PC内の復元だけでは公開サイトは戻りません。復元した差分を確認してコミット・プッシュする必要があります。

## 参考資料

- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/translate
