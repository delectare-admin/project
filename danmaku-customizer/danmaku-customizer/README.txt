弾幕カスタマイズ導入コード（2026-10-17）

追加する機能
・工具ボタンから開く半透明のカスタマイズパネル
・360度の色相リング＋内側の鮮やかさ／明るさ、色コード、基本色
・位置：上／中／下（選んだ高さの帯を右から左へ流れます）
・文字サイズ：1～5、0.1刻みのスライダー。標準は3
・入力中の文字によるプレビュー、リセット、ブラウザー内への設定保存
・投稿した色／位置／サイズをサーバーで検証・保存し、他の視聴者にも表示
・以前の弾幕は元の見た目を維持
・スタンプは「準備中」の表示のみ。作成・送信は今回は実装していません

ファイル
1. install-danmaku-customizer.cjs：通常はこちらを使います。
2. functions-index.js：Firebaseサーバー修正版のコード全文（参照用）。
   実際の保存先は anti-spam-server/functions/index.js です。
   導入スクリプトを使えば、自分でコピーする必要はありません。
3. README.txt：この説明書。

【1】準備
ZIPを展開し、install-danmaku-customizer.cjs を公開用の index.html と
同じ project フォルダーへコピーします。

VS Codeのターミナルで、project フォルダーに移動します。
現在の環境なら次のコマンドです。

Set-Location "C:\Users\anima\OneDrive\デスクトップ\project"

【2】ローカルファイルへ適用
次の1行を実行します。

node .\install-danmaku-customizer.cjs

成功時に更新されるのは、次の2ファイルです。
・index.html
・anti-spam-server/functions/index.js

元の2ファイルはWindowsの一時フォルダーに自動でバックアップされます。
保存先はターミナルに表示されます。今回は index.customized.html などを
作らず、公開用の index.html を直接更新します。CSPハッシュも再計算します。

「対象コードが一致しません」「既に適用済み」などが出たときは、
ファイルは変更しません。表示されたメッセージをそのまま送ってください。
このスクリプト自体はネット通信・Firebaseへの書き込み・デプロイをしません。

【3】先にFirebaseのサーバーを更新
project フォルダーから、1行ずつ実行します。

cd .\anti-spam-server
firebase deploy --only functions:anti-spam --project testo-movie-site

Deploy complete! が表示されたら、次へ進みます。
Firebase ConsoleのFirestore／Storageルールを変更する作業はありません。
新しい設定も、既存の submovieGuard 関数を通して保存します。
既存の連投制限、編集5回まで、動画投稿1日10件までの制限はそのままです。
package.jsonの変更や、新しいnpmパッケージの追加も不要です。

【4】GitHubへ送信
先ほどの anti-spam-server フォルダーから project に戻ります。

cd ..

変更した2ファイルだけを対象に、1行ずつ実行します。

 git add -- index.html anti-spam-server/functions/index.js
 git commit --only -m "弾幕の色・位置・サイズ設定を追加" -- index.html anti-spam-server/functions/index.js
 git push origin main

GitHubのActionsで、新しい公開処理が緑色の成功表示になるのを確認します。
その後、サイトを再読み込みしてください。

【5】動作確認
・動画を開く → 弾幕入力欄の左の工具を押す
・色、位置、サイズを変更 → 完了 → 弾幕を送信
・別のブラウザーでも、その弾幕が設定どおりに表示されるか確認する
・ページを開き直す → 工具を押す → 自分の送信設定が残るか確認する

今回実施した検証
・PCブラウザー／スマホ相当の縦・横・幅320pxの画面でUIを操作
・色相リングと鮮やかさ／明るさのタッチ操作、色コード、基本色
・送信データ → コメント受信 → 色／位置／サイズが描画に反映されること
・旧形式の弾幕、任意のCSSやHTMLを表示させようとする値の安全な扱い
・コンテナーの全画面表示、動画を停止せずにパネルを開くこと
・設定保存、再読み込み、リセット、キーボード操作
・サーバーの入力検証、ログイン、連投制限、編集回数、動画投稿上限
・全scriptの構文、CSPハッシュ、外部scriptのSRIを確認
・導入スクリプトのバックアップ、重複実行・対象不一致時の停止

ブラウザーテストはChromiumでFirebaseを模擬して実施しています。
iPhone実機と本番Firebaseを使った送信・デプロイは未実施です。
公開サイトやFirebaseへの反映は、上記の操作をするまで行われません。
