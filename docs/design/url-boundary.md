# 掲示板URLの責務境界

掲示板URLの形式、ホスト分類、正規化、意味情報の抽出とURL生成は `packages/ch-lib` に集約する。`src/` は取得結果を画面や保存形式へ渡すが、`read.cgi` などのパス構造や掲示板ホストを直接解析しない。

## ch-libへ置く処理

- 5ch互換、したらば、まちBBSなどのホスト・パス形式の分類
- 標準、短縮、dat、itest、ULA、過去ログ形式の解析と正規URLへの変換
- 板URL・スレURL・レス番号・過去ログ状態などの意味情報の抽出
- 板URL、dat取得先、subject取得先、過去ログURLなど掲示板固有URLの生成
- 既読保存用URLや同一性キーなど、掲示板URLに基づく識別値の生成

呼び出し側は `resolveBoardUrl(input, { mode, resolveServerHostname })` を入口にする。`mode` は入力経路が決める解釈範囲で、クリック等の厳密な判定には `strict`、通常のブラウズには `browse`、オムニバーの曖昧な入力を推測する場合には `guess` を使う。itestの対応表はアプリがbbsmenu等から取得・保存し、`resolveServerHostname` として解決処理へ渡す。

## srcに残す処理

- HTTP通信、キャッシュ、BBSMENUの取得と保存
- どの入力経路で厳密判定や推測を許すかという操作ポリシー
- 解析結果をタブ、履歴、クリック動作、画面表示へ対応付ける処理
- localStorage、IndexedDB、SQLiteなどの保存方式と、保存するタイミング
- host permissionやcontent scriptの実行範囲など、ブラウザ拡張の権限設定

保存先の都合で必要なキー変換も、形式を `src/` で解釈せずch-libの意味APIを使う。たとえば既読DBのホスト横断キーは `normalizeReadStateUrl`、照合用のboard/thread identityは `resolveBoardUrl` の `boardKey` / `threadKey` を使う。これらは保存・比較キーであり、利用者に見せるURLではない。

## URLと識別値

`threadId` はURLから得るスレッド番号、`threadKey` はschemeやquery/hashに依存しないスレッド同一性、`boardKey` は板同一性を表す。これらは互換性のための異なる値なので混同しない。`boardName` は板の意味上の名前・識別子であり、画面表示や掲示板ごとのフォーム項目に必要な場合は解析結果を使い、URL pathnameの分割から作らない。

正規URL (`url` / `threadUrl` / `boardUrl`) は画面遷移・通信先として使う。identityは重複判定や保存レコードの照合に使う。たとえば保存キーを画面に表示したり、画面用URLをscheme込みのまま同一性比較へ使ったりしない。

## 型の一本化と依存ルール

掲示板URLを扱うクラスは `packages/ch-lib` の `ChURL` に一本化する。`src/core/URL.ts` は短縮URL展開などのアプリ処理と、既存の `window.app.URL.URL` 公開契約を保つための `ChURL` の別名だけを持ち、独自のURLクラスや掲示板解析を実装しない。新しい呼び出し元は `ChURL` を直接利用する。

旧来の呼び出し元が使う `fix`、`setProtocol`、`getResNumber` などのヘルパーは、保存キーや履歴との互換性を確認したうえで `ChURL` とch-libの意味APIへ委譲する。`src/` から `PATTERNS`、`ROUTE_PATTERNS`、`HOSTNAME`、`TSLD` を直接importしない。掲示板パスの正規表現、segment分解、`read.cgi`等のURL組み立ても追加しない。該当処理が必要ならch-libの意味APIを拡張する。
