# セキュリティヘッダーの確認と、残っている対応

確認日: 2026年10月26日
対象: https://delectare-admin.github.io/project/

## 今回確認できたこと

添付のチェック結果には、次の不足が表示されています。実際の公開ページのHTTP応答でも、確認時点で2つのヘッダーがないことを確認しました。HTMLのContent-Typeは text/html; charset=utf-8 で、HTTPSのHSTSは付いていました。

- X-Content-Type-Options: nosniff
- X-Frame-Options: SAMEORIGIN、または同等のCSP frame-ancestors

これは配信設定の不足であり、情報流出が発生したことを示す結果ではありません。

## 今回のコード適用では、この2件は解消しません

現在のURLはGitHub.comのGitHub Pagesです。この環境には、リポジトリのHTML、CSS、JavaScriptや設定ファイルから任意のHTTPレスポンスヘッダーを設定する機能がありません。GitHub Enterprise Serverの管理者向け設定とは別です。

X-Frame-OptionsとCSP frame-ancestorsをmetaタグに書いても無効です。X-Content-Type-Optionsをmetaタグに足したり、JavaScriptのfetchに同じ名前のヘッダーを付けたりしても、ページを配信するHTTP応答の対策にはなりません。

現在のCSPを削除したり、無効なmetaタグを追加して修正済みと扱ったりはしていません。今回更新したインラインスクリプトに合わせてCSPのSHA-256を更新し、許可先とその他の制限は維持しています。

## ヘッダー対応の配信先へ移る場合

`deployment/security-headers.firebase.example.json` に、Firebase Hosting向けの設定例を同梱しました。これは今のGitHub Pagesには適用されず、公開や移行を自動で行うものでもありません。実際の移行前のレビュー用です。

設定例では次の実際のHTTPヘッダーを送ります。

```http
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Content-Security-Policy: frame-ancestors 'self'
```

レスポンスのCSPはframe-ancestorsだけを追加し、HTML内の既存のCSPと併用する想定です。スクリプト等の許可先を広げません。SAMEORIGINは他サイトによる埋め込みを制限し、自分と同じオリジンの埋め込みは許可します。

`public`は専用の `hosting-public` フォルダーです。プロジェクト全体の `.` を公開対象にしていません。必要なindex.html、実際に使うassets、ロゴ等だけをまとめる必要があります。サーバーコード、秘密の設定、バックアップ、node_modules、アップロード原本をまとめて公開しないでください。

### 機能を維持するための移行前確認

1. 新しい配信先のドメインを決める。github.ioの今のURLのHTTP応答を別サービスで差し替えることはできません。独自ドメインや新しい配信URLが必要です。
2. Firebase Authenticationの承認済みドメインと、App Check/reCAPTCHA Enterpriseの許可ドメインに、新しいサイトを正しく登録する。App Checkの強制検証は解除しない。
3. 現在の `submovieUploadChunk` は `https://delectare-admin.github.io` だけを許可するCORS設定です。移行先だけに限定した許可を追加し、ブラウザの動画投稿を確認する。`*`にして認証・App Checkを外す方法は使わない。
4. ファイルのContent-Typeを確認する。特に .mjs がJavaScript、.css がtext/css、.json がapplication/jsonとして配信されること。nosniffを付けたことで、誤ったMIMEのスクリプトやCSSは読み込まれなくなります。
5. 新しいオリジンでは、ブラウザ内のミュートワード、視聴履歴・途中位置、優先言語等の保存領域が別になります。今の保存内容がそのまま引き継がれるとは限りません。移行用の手段を確認してから切り替える。
6. ログイン、ログアウト、アカウント切り替え、一覧、再生、全画面、各PiP、コメント、弾幕、評価、投稿、検査完了後の公開をプレビュー環境で確認する。
7. その後に本番の切り替えと、公開URLのHTTPヘッダーの再検査を行う。

この確認をせずに既存のFirebase Hostingへ上書きしたり、サイトを自動転送したりはしていません。設定例にFunctionsやFirestoreの変更を混ぜていません。

## 参考資料

- GitHub PagesのカスタムヘッダーについてのGitHub回答:
  https://github.com/orgs/community/discussions/54257
- X-Frame-OptionsはHTTPヘッダーで適用:
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options
- meta http-equivで対応できる範囲:
  https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/http-equiv
- frame-ancestorsはmetaで非対応:
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
- nosniffと正しいContent-Type:
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options
- Firebase Hostingのheaders設定:
  https://firebase.google.com/docs/hosting/full-config
