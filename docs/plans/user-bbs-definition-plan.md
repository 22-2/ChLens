# 掲示板定義（利用者が掲示板の読み方を書ける仕組み）計画

## 進捗

いまの段階: **未着手**。段階の中身と完了条件は §10。段階を終えたら、この表を更新する。

| 段階  | 内容                                   | 状態  | 記録 |
| --- | ------------------------------------ | --- | -- |
| 0   | 掲示板アダプタの登録制と、既存パーサの移し替え              | 未着手 |    |
| 1   | 2ch互換の掲示板を定義なしで自動追加                  | 未着手 |    |
| 2   | chlib: スキーマ・検証・エンジン（`lines`・`json`）  | 未着手 |    |
| 3   | 定義アダプタの組み込みと、JSONのAPIを持つ掲示板での確認       | 未着手 |    |
| 4   | `html` 形式・`unwrap`・`groupBy`・本文の書き換え・引用の照合 | 未着手 |    |
| 5   | 途中が抜けたスレッドの取得と表示                     | 未着手 |    |
| 6   | 定義エディタ・プレビュー・テスト用データの保存              | 未着手 |    |

## 1. 目的と範囲

5ch互換以外の掲示板も、利用者が JSON の「掲示板定義」を書くだけで読めるようにする。定義には、URL の判定、取得先、解析の方法、項目の対応を書く。解析結果は既存のスレッド表示・NG・履歴・お気に入りへそのまま流す。

- 定義は宣言的な JSON とし、文字列をコードとして実行しない。拡張機能では MV3 の CSP とストアの審査があるため、利用者の JS を動かす方式は Chrome・Firefox・Tauri で共通に使えない。
- 既存の 5ch・まちBBS・したらば・bbspink の解析は、同じ登録の仕組みに載せる。ただし、JSON の定義へ書き直すことは目的にしない（段階0では動作を変えない）。
- 定義の書き方は、取得元を役割ごとに分けて書く形に揃える（§4）。

### 範囲外

- 書き込み（フォームの定義、ログイン、Cookie の受け取り）
- 認証が必要な API（OAuth など）
- WebSocket によるリアルタイム取得
- JS で描画する掲示板（取得した HTML に本文がないもの）
- 利用者の JS で動く拡張（「Obsidian のように拡張機能を作れる仕組み」で別に計画する）

## 2. 前提として確認した現状

2026-10-29 時点。

| 対象 | 現状 |
|---|---|
| スレッドの解析 | `packages/chlib/src/parser/ThreadParser.ts` の `parseThread` が `url.getTsld()` の `switch` で形式を選ぶ。取得先と文字コードは同じファイルの `getThreadXhrInfo` が同じく `switch` で決める |
| 板の解析 | `packages/chlib/src/parser/BoardParser.ts` がホストごとに分岐する。取得先は `fetcher/BoardFetchPolicy.ts` |
| 対応ホスト | `packages/chlib/src/url/hosts.ts` の `classifyBoardHost` が許可制で判定する。ここで `null` になるホストは内部で開かない |
| 取得と差分 | `src/core/thread/Thread.ts` が `executeThreadFetch`（`chlib/src/fetcher/ThreadFetchExecutor.ts`）を呼ぶ。差分の取り方は `ThreadFetchPolicy.ts` が `tsld` で分岐する。キャッシュは取得先のパスをキーにし、`resLength` を次の差分の開始位置に使う |
| 解析結果の形 | `ParsedThread { title, res: ThreadRes[], expired }`。`ThreadRes` は `name / mail / message / other / id` だけで、レス番号は配列の位置で決まる |
| 本文の安全性 | `src/core/thread/sanitize-message-html.ts` が表示の直前に DOMPurify の許可リストで本文を組み直す。DOM のない環境では例外にする |
| 別経路の利用者 | `src/mcp/worker-runtime.ts` も `parseThread` と `getThreadXhrInfo` を使う |
| 通信の権限 | 拡張機能は `src/manifest.json` の `host_permissions` で全ホストを許可済み。Tauri は `src-tauri/src/http_transport.rs` の reqwest 経由で、ホストの制限はない。新しい権限の要求は不要 |
| 検証ライブラリ | 未導入。`monaco-editor` は導入済み（NG ルールのエディタ） |
| CSP | `src/manifest.json` の `extension_pages` は `script-src 'self'` だけで、`'unsafe-eval'`・`'wasm-unsafe-eval'` がない。`new Function` で関数を作るライブラリと wasm は拡張機能で動かない |
| 対応する最小版 | `src/manifest.json` で Chrome 103・Firefox 103（`strict_min_version`）。Tauri は WebView2（Chromium） |
| 拡張の方針 | `docs/plans/extension-points-plan.md` は「まず内部の機能で登録制を使い、外部への公開は後の段階」としている。本計画の段階0も同じ考え方を取る |

## 3. 調査した掲示板の形

2026-10-29 に公開ページを取得して確かめた。（未確認）と書いたものは推測で、実装の前に確かめる。

### 2ch互換（dat）

- `<>` 区切りの行で、1行が1件。スレタイは1行目の5列目にだけある。
- `/test/read.cgi/{板}/{キー}/` の形の URL なら、`SETTING.TXT` や dat を試しに取得して判定できる。

### ふたば☆ちゃんねる

- スレッドの HTML（Shift_JIS）には1件目と返信のすべてがある。1件目は `div.thre`（`data-res` 属性に No.）。
- `futaba.php?mode=json&res={スレのNo.}&start={No.}` が UTF-8 の JSON で返信を返す。
  - `res` は配列ではなく、No. をキーにしたオブジェクト。
  - `start` に指定した No. も結果に含む。No. は板全体の通し番号なので、実在しない番号を指定してもよい。
  - **1件目は `start` の有無にかかわらず含まれない**。1件目は HTML から取る。
  - 1件分の項目: `now`（日時の文字列）、`name`、`email`、`sub`、`com`（HTML。引用は `<font color="#789922">&gt;…</font>`）、`rsc`（返信の連番。1件目にはない）、`src`・`thumb`（相対パス）、`del`、`id`、`host`。
  - スレ全体の項目: `die`・`dielong`（落ちる予定の時刻）、`old`（もうすぐ落ちる印）、`nowtime`、`sd`（そうだねの数。今回は空で形は未確認）。
  - `Last-Modified`・`ETag` は返らない。キャッシュを避ける引数が要る。
- カタログ（`mode=cat`）は Shift_JIS の HTML だけ。`#cattable td` 1つが1スレで、URL・サムネイル・タイトル（数文字で切られる）・レス数がある。スレ立ての時刻はない（サムネイルのファイル名がミリ秒のUNIX時間に見えるので、推定には使える）。並び順は `sort=` で変わる。表示の文字数は Cookie で持つ設定で変わるらしい（未確認）。
- 第三者のサービス（ふたポ）が、板ごとの一覧を `<>` 区切りの UTF-8 テキストで公開している。意味がわかる列は 0 URL、1 サムネイル、2 レス数、4 スレ立ての時刻、5 取得時刻、7 タイトル（本文の冒頭）。`Last-Modified`・`ETag` が返る。

### 4chan

- 公式の読み取り API がある。`catalog.json` は `[{ page, threads: [...] }]`、`threads.json` は同じ形で各スレが `{ no, last_modified, replies }` だけの軽い一覧。
- スレ本体の JSON は1件目も含む。差分だけを取る仕組みはなく、条件付き取得で取り直す。
- `Last-Modified`・`ETag`・`Cache-Control: max-age=5` が返る。取得の間隔と `If-Modified-Since` の利用が API の決まりで求められている。
- `sub`（タイトル）はないことがある。画像の URL は `tim` と `ext` を組み合わせて作る。

### Steam コミュニティ

- フォーラムを読む公式の API は見当たらない。公開ページの HTML を読む。
- 板の一覧は HTML で15件ずつ。`/forum/{owner}/General/render/0/?start=&count=` が JSON の中に HTML の断片（`topics_html`）を入れて返す。
- スレの HTML は15件ずつで、続きは `?ctp={ページ}`。1件目は `.forum_op`、返信は `.commentthread_comment`（`id="comment_{ID}"`、`data-miniprofile`、`data-timestamp`）。
- スクリプトの `InitializeCommentThread(…, {…})` に `total_count`・`pagesize`・`oldestfirst` が JSON で入っている。
- 返信を返す内部の経路は Cookie なしでは拒否された。公開された仕様ではないので使わない。
- `Cache-Control: no-cache` で、`Last-Modified` は返らない。

### ニコニコ大百科

- 掲示板は `/b/{種類}/{記事名}/{開始番号}-` で30件ずつ。開始番号はページ番号ではなくレス番号（1、31、61…）。
- UTF-8 の HTML で、`Last-Modified` が返る。
- **1件分が1つの要素に収まっていない**。`dt.st-bbs_reshead`（番号・名前・日時・ID）、`dd.st-bbs_resbody`（本文）、`dd.res_reaction`（高評価・低評価の数）が兄弟要素として並び、3つとも `data-res_no` を持つ。
- 本文には `>>N` のアンカー（`a.dic`）と、単語を記事へつなぐ自動リンク（`a.auto`）が混ざる。
- 1ページ目のページ送りに、最後のページへのリンクがある。
- 板に当たるものはない。

### Reddit（2026-10-29 に curl で確認）

認証なしで試した結果。いずれも1台の端末・1つのIPからの観測で、IPや時期で変わりうる。

| 取得元 | 結果 |
|---|---|
| `www.reddit.com/…/new.json`、`…/comments/{id}/.json` | UA を `curl`・ブラウザ風・Reddit 推奨形式（`platform:app:version (by /u/name)`）のどれにしても **403 Blocked**（HTML のブロック画面） |
| `old.reddit.com/….json` | ログイン画面へ302 |
| `oauth.reddit.com/….json`（トークンなし） | 403 |
| `www.reddit.com/…/new.rss`、`…/comments/{id}/.rss` | **200**（Atom）。UA が `curl` のときだけ403 |

- RSS には `x-ratelimit-used` / `-remaining` / `-reset` が返る。`remaining` は取得直後に 0 になり、`reset` 秒（約60秒）が過ぎるまで次の要求は **429**。実質、同じ窓の中で1要求。
- RSS はスレ一覧、コメントともに Atom。木構造ではなく平らな `entry` の並びなので、`children` は使えない。`limit` 付きでも取れることは確認したが、コメントの親子関係が取れるか、100件を超えて取れるかは未確認。
- 認証なしの JSON は閲覧に使えない前提にする。JSON を使うなら OAuth（利用者ごとのアプリ登録とトークン）が要り、定義ファイルだけでは完結しない。

### 調査から決めたこと

| わかったこと | 設計での対応 |
|---|---|
| 初回と差分で取得元も形式も違う（ふたば） | 取得元を `initial` と `update` に分ける |
| 差分の取り方がサイトごとに違い、指定した番号を含むかどうかもばらばら | 重複の除去はエンジンが `postKey` で必ず行う |
| JSON の中に HTML、HTML のスクリプトの中に JSON がある | 解析の前に中身を取り出す `unwrap` |
| 1件分が兄弟要素に分かれる | `groupBy` |
| ページ番号で指定するサイトと開始番号で指定するサイトがある | ページ送りに `template` と `offset` |
| 長いスレを全部は取れない | `latest` と `initialRange`。途中が抜けたスレを扱えるようにする |
| 反応の種類がサイトごとに違う | `reactions` を種類ごとの数にする |
| 板一覧の取得元が第三者のサービスのことがある | 板の取得元を配列にして、上から順に試す |
| 軽い更新確認用の一覧がある（4chan） | 板に `stats` を設ける |
| 落ちる予定の時刻が取れる（ふたば） | `thread.meta.expiresAt` |
| 取得頻度が応答ヘッダで示される（Reddit の RSS） | 応答の `x-ratelimit-reset` と `Retry-After` を読み、429 のあいだは自動更新の間隔を延ばす。エラーとしてログに残す（段階3で通信層に入れる） |
| Reddit の認証なしで読める形式が Atom だけ | `format: "xml"`（Atom）を追加するか決める（§11）。追加しない場合、Reddit は対象外にする |

## 4. 設計方針

- **取得元を役割ごとに分ける。** スレッドは「初回」と「差分」、板は「一覧（予備を含めて複数）」と「軽い更新確認」に分ける。取得元が1つで済む掲示板は `initial` だけを書く。
- **形式は `lines`・`json`・`html` の3つ。** どれも「1件分を取り出す場所」と「項目ごとの取り出し方」で書く。
- **差分の取り方は3種類。** `full`（条件付き取得で取り直す）、`since`（最後の `postKey` などを URL に入れる）、`page`（最後に読んだレス番号から取り直すページを計算する）。
- **エンジンの責任と定義の責任を分ける。** 重複の除去、並べ直し、取得の間隔、条件付き取得、キャッシュはエンジンが行う。定義には、そのサイトに固有のことだけを書く。
- **本文の安全性は既存の入口に任せる。** 解析結果の本文は、表示の直前に既存の `sanitizeMessageHtml` を必ず通る。定義の側で安全性を確保する前提にしない。
- **危ない部品は自前で書かず、規格と実績のある実装に任せる。** 正規表現は re2js、JSON のパスは RFC 9535、URL の判定は URLPattern、取得元の URL は RFC 6570 に従う。式を評価する言語（JSONata など）は入れず、値の加工は `pipe` の固定の種類だけにする。選んだ理由と見送ったパッケージは §12。

## 5. スキーマ

型は `packages/chlib/src/definition/schema.ts` に置く。検証は zod（v4）で書き、`z.toJSONSchema()` で JSON Schema を作って Monaco の補完と検証に使う（§11 の判断事項）。

zod v4 は、`new Function` が使えるかを試してから検証関数を生成する。拡張機能の CSP（§2）では使えないうえ、この試し自体が `securitypolicyviolation` として報告されるため、起動時に `z.config({ jitless: true })` を指定する。スキーマには `.transform()` を使わない（`z.toJSONSchema()` で JSON Schema にできなくなるため）。

### 最上位

```ts
export interface BbsDefinition {
  schemaVersion: 1;
  id: string;                    // 保存キーとログに使う
  name: string;
  version?: string;              // 定義自体の版。壊れたときの切り分けに使う
  match: MatchSpec;
  network?: NetworkSpec;         // 既定値。各取得元の fetch で上書きできる
  thread: ThreadSpec;
  board?: BoardSpec;
  boardMenu?: BoardMenuSpec;
}
```

### URL の判定と正規化

```ts
export interface MatchSpec {
  thread: UrlPatternSpec[];
  board?: UrlPatternSpec[];
  /** 同じスレの別表記を1つに揃える。履歴・お気に入りの同一性に使う */
  canonical: { thread: Template; board?: Template };
}

/**
 * URLPattern に渡す入力（URLPatternInit の一部）。
 * `:board` のような名前付きグループと `(\\d+)` のような正規表現のグループが、テンプレートの変数になる。
 * 書かなかった部分は何にでも一致する。
 */
export interface UrlPatternSpec {
  protocol?: string;             // 省略時は "http{s}?"。http・https 以外は検証で拒否する
  hostname: string;              // 例: ":server.2chan.net"
  pathname: string;              // 例: "/:board/res/:key(\\d+).htm"
  search?: string;
}

export type Template = string;
```

URL の判定は、Web 標準の `URLPattern` で行う。ホスト・パス・クエリを別々の正規表現で判定するより、利用者が書きやすく、判定の抜けも起きにくい。

- `URLPattern` に対応するのは Chrome 95・Firefox 142・Safari 26 から（MDN の互換性データ、2026-10-29 時点）。Firefox 版の最小版は 103 なので、`urlpattern-polyfill` で補う（最小版を上げるかは §11 の判断事項）。
- 正規表現のグループ（`(\\d+)` など）は、ブラウザ標準の `RegExp` で動くため、re2js の線形時間の保証（§7）の外にある。入力が長さを制限した URL だけであることと、パターンの長さの制限で抑える。

§8 の例のパターンは、Node 26 の `URLPattern` で意図どおりに一致することを確かめた（2026-10-29）。グループの値はパーセントエンコードされたまま返る。そのため、グループの値は、パーセントエンコードを戻して NFC に正規化してから使い、`canonical` を作るときにエンコードし直す。日本語の記事名をキーにする掲示板（ニコニコ大百科）で、表記ゆれが別のスレとして扱われるのを防ぐ。

テンプレートは2種類ある。

- **取得元の `url`、`canonical`、`sorts` の `url`** は RFC 6570（URI Template）で展開する（url-template を使う）。値はパーセントエンコードされるので、URL を丸ごと入れる変数は `{+canonical}` のように予約文字を残す書き方にする。
- **項目のテンプレート**（`{$.path}`・`{@selector}` を含むもの）は、RFC 6570 の変数名に `$`・`@` を使えないため自前で展開する。URL を組み立てる項目では、値を `encodeURIComponent` してから埋め込む。

テンプレートで使える変数:

| 変数 | 使える場所 | 内容 |
|---|---|---|
| `{origin}`・`{host}`・グループ名 | すべて | URL から取り出した値 |
| `{canonical}` | 取得元 | 正規化したスレや板の URL |
| `{page}`・`{offset}` | ページ送り | ページ番号、開始番号 |
| `{lastKey}`・`{lastNumber}` | 差分の取得元 | 最後に取得したレスの `postKey`・`number` |
| `{now}`・`{random}` | 取得元 | キャッシュを避ける引数 |
| `{$.path}`・`{@selector}` | 項目のテンプレート | その1件の項目の値 |

### 通信

```ts
export interface NetworkSpec {
  /** match の hostname 以外に通信するホスト。設定画面で利用者に示す */
  hosts?: string[];
  charset?: "UTF-8" | "Shift_JIS" | "EUC-JP";
  headers?: Record<string, string>;     // User-Agent・Cookie・Authorization は指定できない
  /** 通信先が network.hosts と match の hostname のときだけ送る。設定画面で必ず示す */
  cookies?: Record<string, string>;
  minIntervalMs?: number;
  conditional?: boolean;                // If-Modified-Since / If-None-Match を送る
}

export interface FetchSpec extends NetworkSpec {
  url: Template;
  pagination?: Pagination;
}

export type Pagination =
  | {
      type: "template";                 // url で {page} を使う
      start: number;
      maxPages: number;
      total?: Extractor;                // 全件数がわかればページ数を計算する
      pageSize?: number | Extractor;
      stopWhenShort?: boolean;          // pageSize 未満の件数で終える
    }
  | { type: "offset"; first: number; step: number; maxPages: number; stopWhenShort?: boolean } // url で {offset} を使う
  | { type: "next_link"; extract: Extractor; maxPages: number };
```

取得の間隔は、定義の `minIntervalMs` と、応答の `Cache-Control: max-age` の長いほうを下限にする。自動更新もこの下限を守る。

### スレッド

```ts
export interface ThreadSpec {
  sources: { initial: ThreadSource; update?: ThreadSource };
  incremental?: Incremental;            // 省略時は full
  order?: "asc" | "desc";               // desc なら解析後に並べ直す
  expired?: ExpiredRule[];
  title?: Extractor;
  meta?: {
    expiresAt?: Extractor;              // 落ちる予定の時刻。過ぎたら自動更新を止める
    closing?: Extractor;                // もうすぐ落ちる印
    totalCount?: Extractor;
    maxPosts?: number;
  };
  replyResolve?: ReplyResolve[];
  /** reactions のキーごとの表示。定義にないキーは表示しない */
  reactions?: Record<string, { label: string; icon?: string }>;
}

export interface ThreadSource {
  fetch: FetchSpec;
  parse: ParseSpec<PostFields>;
  /** 最後のページの番号（offset のときは開始番号）を返す */
  latest?: Extractor;
  /** 初回に取るページの範囲。省略時は all */
  initialRange?: "all" | { first: number; last: number };
}

export type Incremental =
  | { mode: "full" }                    // initial を条件付き取得で取り直す
  | { mode: "since" }                   // update の url で {lastKey}・{lastNumber} を使う
  | { mode: "page"; pageSize: number | Extractor };

export type ExpiredRule =
  | { status: number[] }
  | { exists: Extractor }
  | { equals: Extractor; value: string | number | boolean };

export type ReplyResolve =
  | { type: "anchor"; pattern?: string }                     // 既定は >>N。number か postKey と照合する
  | { type: "quote"; selector?: string; minLength?: number }; // 「>本文の一部」を前のレスの本文と照合する
```

### 解析

```ts
interface ParseCommon {
  unwrap?: Unwrap[];
  message?: MessageSpec;
}

export type ParseSpec<F> = ParseCommon &
  (
    | {
        format: "lines";
        separator: string;              // 改行は CRLF・LF の両方を受け付ける
        skipEmpty?: boolean;
        fields: FieldMap<F, LinesExtractor>;
      }
    | {
        format: "json";
        items: string;                  // 例: "$.posts[*]"、"$.res.*"（オブジェクトの値を順にたどる）
        children?: string;              // 木構造を平らにする。parentKey は自動で入る
        fields: FieldMap<F, JsonExtractor>;
      }
    | {
        format: "html";
        items: string | ItemGroup<F>[]; // 構造ごとに項目定義を変えるときは配列
        groupBy?: { attribute: string };// 同じ値を持つ要素を1件分にまとめる
        fields: FieldMap<F, HtmlExtractor>;
      }
  );

export interface ItemGroup<F> {
  selector: string;
  fields?: FieldMap<F, HtmlExtractor>;  // 共通の fields を項目ごとに上書きする
}

export type Unwrap =
  | { from: "json"; path: string }      // JSON の文字列の値を次の入力にする
  | { from: "script"; marker: string }; // marker の後にある最初の {…} を JSON として取り出す（実行はしない）

export interface MessageSpec {
  rewrite?: (
    | { selector: string; action: "unwrap" }   // タグを外して文字だけ残す
    | { selector: string; action: "remove" }
  )[];
}
```

### 項目の取り出し方

```ts
type FieldValue<E> =
  | E
  | E[]                                 // 最初に値が取れたものを使う
  | Template                            // 例: "https://boards.example.com/{board}/thread/{$.no}"
  | { when: E; value: Template };

type FieldMap<F, E> = { [K in keyof F]?: FieldValue<E> };

export interface ExtractorBase {
  as?: "text" | "html" | "attr" | "raw"; // json は raw、html は text が既定
  attribute?: string;
  multiple?: boolean;
  pipe?: Transform[];
  default?: string | number;
  unwrap?: Unwrap[];                    // スクリプト内の JSON など、文書の外側から読むとき
}

export type LinesExtractor = ExtractorBase & { column: number; line?: number }; // line は title 用
export type JsonExtractor = ExtractorBase & { path: string };  // "@key" はオブジェクトのキー、"$root" は全体
export type HtmlExtractor = ExtractorBase & { selector?: string }; // 省略時は1件分の要素そのもの
export type Extractor = LinesExtractor | JsonExtractor | HtmlExtractor;
```

JSON のパスは RFC 9535（JSONPath）に従い、評価は json-p3 に任せる。

- 使えるのは名前・添字・ワイルドカード（`$.a.b`、`[0]`、`[*]`、`.*`）とスライスまで。フィルタ式（`[?…]`）と関数の拡張は検証の段階で拒否する。こうすると、json-p3 がフィルタ式をどう評価するかに安全性が左右されない。
- 項目のパスでは `$` を1件分の値として評価する。`$root`（取得した JSON 全体）と `@key`（オブジェクトのキー。`$root.x[@key]` のように使う）は RFC 9535 にない独自の書き方なので、json-p3 に渡す前にエンジンが置き換える。

### 値の加工

```ts
export type Transform =
  | { type: "trim" }
  | { type: "regex"; pattern: string; group?: number | string; flags?: string }
  | { type: "replace"; pattern: string; with: string; flags?: string }
  | { type: "split"; separator: string; index?: number }
  | { type: "decode_entities" }
  | { type: "html_to_text" }
  | { type: "absolute_url" }            // 取得したページの URL を基準にする
  | { type: "to_number" }
  | { type: "add"; value: number }
  | { type: "max" }                     // multiple の配列から最大値を取る
  | { type: "truncate"; length: number }
  | { type: "not_empty" }               // 空でなければ true
  | { type: "parse_date"; format: string; timezone?: string } // format: "http" は HTTP の日付形式
  | { type: "unix_time"; unit?: "s" | "ms" }
  | { type: "map"; values: Record<string, string> };
```

`regex`・`replace` の `pattern` は re2js（RE2 の構文）で動かす。先読み・後読み・後方参照は使えない。`flags` は `i`・`m`・`s` だけを受け付け、re2js の後読みのオプション（`LOOKBEHINDS`）は有効にしない（理由は §12）。

### 出力する項目

```ts
export interface PostFields {
  postKey: string;          // サイト内の ID。なければ number を文字列にして使う
  number: number;           // 表示用のレス番号。なければ並び順から振る
  parentKey: string;        // 木構造の親
  name: string;
  mail: string;
  trip: string;
  userId: string;
  host: string;             // 投稿者のホストや IP の表示
  avatar: string;
  date: string;
  message: string;
  replyTo: string[];        // postKey または number
  reactions: Record<string, number>;
  attachments: { url: string; thumbnail?: string; name?: string };
  deleted: boolean;
}
```

`attachments` は1件に複数ありうる。`multiple` で取り出した要素ごとに組み立てるか、`when` 付きのテンプレートで1つ作る。

### 板

```ts
export interface BoardSpec {
  sources: BoardSource<ThreadListFields>[];  // 上から順に試す
  stats?: BoardSource<StatsFields>;          // 軽い更新確認用。key で sources の結果と合わせる
  sorts?: { id: string; label: string; url: Template }[];
}

export interface BoardSource<F> {
  fetch: FetchSpec;
  parse: ParseSpec<F>;
}

export interface ThreadListFields {
  url: string;              // url か key のどちらかが必要
  key: string;
  title: string;
  excerpt: string;          // 1件目の本文の冒頭
  count: number;
  createdAt: string;
  updatedAt: string;
  thumbnail: string;
  pinned: boolean;
  closed: boolean;
}

export interface StatsFields {
  key: string;
  count: number;
  updatedAt: string;
}

export interface BoardMenuSpec {
  fetch: FetchSpec;
  parse: ParseSpec<{ url: string; title: string; category: string }>;
}
```

## 6. 構成

### 置き場所

| ファイル | 内容 |
|---|---|
| `packages/chlib/src/adapter/` | `BbsAdapter` の型と登録の仕組み。既存の4系統を組み込みのアダプタとして登録する（段階0） |
| `packages/chlib/src/definition/schema.ts` | §5 の型と zod のスキーマ |
| `packages/chlib/src/definition/template.ts` | テンプレートの展開。取得元の URL は url-template、項目のテンプレートは自前 |
| `packages/chlib/src/definition/url-match.ts` | `URLPattern`（Firefox では polyfill）による URL の判定と、グループの値の正規化 |
| `packages/chlib/src/definition/json-path.ts` | json-p3 を包み、フィルタ式の拒否と `$root`・`@key` の置き換えを行う |
| `packages/chlib/src/definition/regex.ts` | re2js を包み、パターンの長さとフラグを検査する。定義の正規表現はすべてここを通す |
| `packages/chlib/src/definition/transforms.ts` | 値の加工 |
| `packages/chlib/src/definition/formats/` | `lines`・`json`・`html` の解析と `unwrap` |
| `packages/chlib/src/definition/engine.ts` | 取得計画、ページ送り、重複の除去、並べ直し、`ParsedThread` への変換 |
| `packages/chlib/src/definition/adapter.ts` | 定義から `BbsAdapter` を作る |
| `src/features/bbs-definition/` | 定義の保存、設定画面、エディタ、プレビュー（段階6） |

### アダプタの形

```ts
export interface BbsAdapter {
  id: string;
  matches(url: URL): boolean;
  classify(url: URL): "thread" | "board" | null;
  canonicalize(url: URL): string;
  planThreadFetch(input: ThreadFetchState): ThreadFetchPlan;
  parseThread(response: FetchedResponse, state: ThreadFetchState): ParsedThread | null;
  planBoardFetch?(url: URL): BoardFetchPlan;
  parseBoard?(response: FetchedResponse): BoardThread[];
}
```

`parseThread`・`getThreadXhrInfo`・`BoardParser`・`classifyBoardHost` は、登録されたアダプタを順に問い合わせる形に置き換える。組み込みのアダプタを先に、利用者の定義を後に問い合わせる。

### `ParsedThread` の拡張

`ThreadRes` に省略可能な項目を足す。既存のアダプタは何も変えずに済む。

```ts
export interface ThreadRes {
  name: string;
  mail: string;
  message: string;
  other: string;
  id?: string;
  // 以下は定義アダプタが埋める
  number?: number;
  postKey?: string;
  replyTo?: string[];
  reactions?: Record<string, number>;
  attachments?: { url: string; thumbnail?: string; name?: string }[];
  avatar?: string;
}

export interface ParsedThread {
  title?: string;
  res: ThreadRes[];
  expired?: boolean;
  expiresAt?: string;
  gaps?: { from: number; to: number }[];  // 段階5
}
```

`other` には、既存の表示が読める形（日時と ID）を定義アダプタが組み立てて入れる。`replyTo` は、表示の前に `>>N` のアンカーとして本文に加える。こうすると、既存のアンカーのポップアップや返信ツリーをそのまま使える。

### HTML の解析と実行場所

利用者の正規表現は、ブラウザ標準の `RegExp` では極端に遅くなるパターン（ReDoS）を書けてしまう。そのため定義の正規表現は re2js で動かし、入力の長さに対して線形の時間で終わるようにする（URL の判定だけは例外。§5）。

それでも、大きな HTML の解析やセレクタの組み合わせで時間がかかることはある。同じスレッドで動く処理は途中で止められないので、定義アダプタの解析は Worker で行い、時間を超えたら Worker を終了する。この時間制限は、正規表現の対策ではなく、想定外に重い定義から画面を守る保険として扱う。

Worker には `DOMParser` がない。そのため `html` 形式には、軽量な HTML パーサ（htmlparser2 と css-select など）を chlib に入れる。MCP の Worker（`src/mcp/worker-runtime.ts`）でも同じ解析器が動くようになり、`ThreadParser.ts` の「サービスワーカーでも同じ解析器を使う」という方針とも合う。パーサの選び方は §11 の判断事項。

### 本文の安全性

- 解析結果の本文は、表示の直前に既存の `sanitizeMessageHtml` を必ず通る。定義アダプタ用に別のサニタイズ経路は作らない。
- `message.rewrite` は解析の段階で行う。サニタイズより前なので、書き換えで許可外のタグを作っても表示されない。
- `attachments`・`avatar`・`thumbnail` の URL は `http:`・`https:` だけを受け付ける。

## 7. 安全性と運用の方針

- **コードを実行しない。** `unwrap` の `script` は、文字列から `{…}` を切り出して JSON として読むだけにする。
- **正規表現の制限。** 定義の正規表現は re2js で動かし、後読みのオプションは有効にしない。そのうえでパターンの長さ、入力の長さ、Worker の時間制限を設ける。超えたら詳しいログを出し、その定義の取得を失敗にする。
- **式を評価しない。** JSON のパスのフィルタ式は拒否し、JSONata や CEL のような式言語も入れない。値の加工は `pipe` の固定の種類だけにする。
- **送るヘッダーの制限。** `User-Agent`・`Cookie`・`Authorization` は `headers` では指定できない。`cookies` は定義のホストにだけ送り、設定画面に必ず表示する。
- **通信先の制限。** `http:`・`https:` だけ。他人が書いた定義を読み込んで、ローカルネットワークへ通信させられるのを防ぐため、プライベートアドレスへの通信は既定で拒否する（§11 の判断事項）。
- **取得の間隔。** `minIntervalMs` と `Cache-Control: max-age` の長いほうを下限にし、自動更新もこれを守る。
- **組み込みの定義の線引き。** 組み込みで用意するのは、公式の API がある掲示板と 2ch互換だけにする。HTML を読む掲示板の定義は、利用者が自分で書いて読み込むものとして扱う。
- **壊れたときに気づけるようにする。** 定義ごとに最後に成功した日時を記録する。0件しか取れなかったときは、定義の ID、取得先、使ったセレクタを含めてログに出す。

## 8. 書いた例

セレクタや項目名は §3 の調査に基づく。（未確認）の箇所は段階4で確かめる。

### ふたば（初回は HTML、差分は JSON、一覧は第三者のサービスと公式カタログ）

```jsonc
{
  "schemaVersion": 1,
  "id": "futaba",
  "name": "ふたば☆ちゃんねる",
  "match": {
    "thread": [{ "hostname": ":server.2chan.net", "pathname": "/:board/res/:key(\\d+).htm" }],
    "board": [{ "hostname": ":server.2chan.net", "pathname": "/:board/{futaba.htm}?" }],
    "canonical": {
      "thread": "https://{server}.2chan.net/{board}/res/{key}.htm",
      "board": "https://{server}.2chan.net/{board}/"
    }
  },
  "network": { "minIntervalMs": 5000 },
  "thread": {
    "sources": {
      "initial": {
        "fetch": { "url": "{+canonical}", "charset": "Shift_JIS" },
        "parse": {
          "format": "html",
          "items": [
            { "selector": "div.thre", "fields": { "postKey": { "as": "attr", "attribute": "data-res" }, "number": { "default": 1 } } },
            { "selector": "div.thre td.rtd" }
          ],
          "fields": {
            "postKey": { "selector": ".cno", "pipe": [{ "type": "regex", "pattern": "No\\.(\\d+)", "group": 1 }] },
            "number":  { "selector": ".rsc", "pipe": [{ "type": "to_number" }, { "type": "add", "value": 1 }] },
            "name":    { "selector": ".cnm" },
            "date":    { "selector": ".cnw", "pipe": [{ "type": "parse_date", "format": "yy/MM/dd(EEE)HH:mm:ss" }] },
            "message": { "selector": "blockquote", "as": "html" }
          }
        }
      },
      "update": {
        "fetch": { "url": "https://{server}.2chan.net/{board}/futaba.php?mode=json&res={key}&start={lastKey}&{random}" },
        "parse": {
          "format": "json",
          "items": "$.res.*",
          "fields": {
            "postKey":   { "path": "@key" },
            "number":    { "path": "$.rsc", "pipe": [{ "type": "to_number" }, { "type": "add", "value": 1 }] },
            "name":      { "path": "$.name" },
            "mail":      { "path": "$.email" },
            "userId":    { "path": "$.id" },
            "host":      { "path": "$.host" },
            "date":      { "path": "$.now", "pipe": [{ "type": "parse_date", "format": "yy/MM/dd(EEE)HH:mm:ss" }] },
            "message":   { "path": "$.com", "as": "html" },
            "deleted":   { "path": "$.del", "pipe": [{ "type": "not_empty" }] },
            "reactions": { "sodane": { "path": "$root.sd[@key]", "pipe": [{ "type": "to_number" }], "default": 0 } },
            "attachments": { "when": { "path": "$.src", "pipe": [{ "type": "not_empty" }] }, "url": "{$.src}", "thumbnail": "{$.thumb}" }
          }
        }
      }
    },
    "incremental": { "mode": "since" },
    "meta": {
      "expiresAt": { "path": "$.dielong", "pipe": [{ "type": "parse_date", "format": "http" }] },
      "closing":   { "path": "$.old", "pipe": [{ "type": "to_number" }] }
    },
    "expired": [{ "status": [404] }],
    "reactions": { "sodane": { "label": "そうだね" } },
    "replyResolve": [{ "type": "quote", "selector": "font[color]", "minLength": 4 }]
  },
  "board": {
    "sources": [
      {
        "fetch": { "url": "https://{server}.2chan.net/{board}/futaba.php?mode=cat", "charset": "Shift_JIS" },
        "parse": {
          "format": "html",
          "items": "#cattable td",
          "fields": {
            "url":       { "selector": "a", "as": "attr", "attribute": "href", "pipe": [{ "type": "absolute_url" }] },
            "key":       { "selector": "a", "as": "attr", "attribute": "href", "pipe": [{ "type": "regex", "pattern": "res/(\\d+)\\.htm", "group": 1 }] },
            "thumbnail": { "selector": "img", "as": "attr", "attribute": "src", "pipe": [{ "type": "absolute_url" }] },
            "title":     { "selector": "small" },
            "count":     { "selector": "font", "pipe": [{ "type": "to_number" }] }
          }
        }
      }
    ]
  }
}
```

（未確認）返信の要素（`td.rtd`）、`sd` の形、`meta` を `initial`・`update` のどちらのデータから読むか。ふたポを取得元に加えるかは §11 の判断事項。

### 4chan（板の一覧と軽い更新確認）

```jsonc
{
  "board": {
    "sources": [{
      "fetch": { "url": "https://a.4cdn.org/{board}/catalog.json", "conditional": true },
      "parse": {
        "format": "json",
        "items": "$[*].threads[*]",
        "fields": {
          "key":       { "path": "$.no" },
          "url":       "https://boards.4chan.org/{board}/thread/{$.no}",
          "title":     [{ "path": "$.sub" },
                        { "path": "$.com", "pipe": [{ "type": "html_to_text" }, { "type": "truncate", "length": 60 }] }],
          "excerpt":   { "path": "$.com", "pipe": [{ "type": "html_to_text" }] },
          "count":     { "path": "$.replies" },
          "createdAt": { "path": "$.time", "pipe": [{ "type": "unix_time" }] },
          "updatedAt": { "path": "$.last_modified", "pipe": [{ "type": "unix_time" }] },
          "thumbnail": { "when": { "path": "$.tim" }, "value": "https://i.4cdn.org/{board}/{$.tim}s.jpg" },
          "pinned":    { "path": "$.sticky", "pipe": [{ "type": "not_empty" }] }
        }
      }
    }],
    "stats": {
      "fetch": { "url": "https://a.4cdn.org/{board}/threads.json", "conditional": true },
      "parse": {
        "format": "json",
        "items": "$[*].threads[*]",
        "fields": {
          "key":       { "path": "$.no" },
          "count":     { "path": "$.replies" },
          "updatedAt": { "path": "$.last_modified", "pipe": [{ "type": "unix_time" }] }
        }
      }
    }
  }
}
```

### ニコニコ大百科（兄弟要素をまとめる、最新のページから読む）

```jsonc
{
  "schemaVersion": 1,
  "id": "nicopedia",
  "name": "ニコニコ大百科",
  "match": {
    "thread": [{ "hostname": "dic.nicovideo.jp", "pathname": "/b/:kind([a-z])/:key/{:start(\\d+)-}?" }],
    "canonical": { "thread": "https://dic.nicovideo.jp/b/{kind}/{key}/" }
  },
  "network": { "conditional": true, "minIntervalMs": 10000 },
  "thread": {
    "sources": {
      "initial": {
        "fetch": {
          "url": "https://dic.nicovideo.jp/b/{kind}/{key}/{offset}-",
          "pagination": { "type": "offset", "first": 1, "step": 30, "maxPages": 400, "stopWhenShort": true }
        },
        "latest": {
          "selector": ".st-pg_contents a", "as": "attr", "attribute": "href", "multiple": true,
          "pipe": [{ "type": "regex", "pattern": "/(\\d+)-$", "group": 1 }, { "type": "to_number" }, { "type": "max" }]
        },
        "initialRange": { "first": 1, "last": 2 },
        "parse": {
          "format": "html",
          "items": "[data-res_no]",
          "groupBy": { "attribute": "data-res_no" },
          "fields": {
            "postKey":   { "selector": "dt", "as": "attr", "attribute": "data-res_no" },
            "number":    { "selector": "dt", "as": "attr", "attribute": "data-res_no", "pipe": [{ "type": "to_number" }] },
            "name":      { "selector": ".bbs_name" },
            "userId":    { "selector": "dt", "as": "attr", "attribute": "data-id_hash" },
            "date":      { "selector": ".bbs_resInfo_resTime", "pipe": [{ "type": "parse_date", "format": "yyyy/MM/dd(EEE) HH:mm:ss" }] },
            "message":   { "selector": ".bbs_resbody_inner", "as": "html" },
            "reactions": {
              "good": { "selector": ".res_reaction_good_count", "pipe": [{ "type": "to_number" }] },
              "bad":  { "selector": ".res_reaction_bad_count", "pipe": [{ "type": "to_number" }] }
            }
          },
          "message": { "rewrite": [{ "selector": "a.auto", "action": "unwrap" }] }
        }
      }
    },
    "incremental": { "mode": "page", "pageSize": 30 },
    "title": { "selector": "title", "pipe": [{ "type": "regex", "pattern": "「(.+)」について語るスレ", "group": 1 }] },
    "reactions": { "good": { "label": "高評価" }, "bad": { "label": "低評価" } },
    "replyResolve": [{ "type": "anchor" }]
  }
}
```

（未確認）低評価の数のクラス名、`data-res_hidden` の意味（削除か、利用者ごとの非表示か）、`a` 以外の記事の種類で URL の形が同じか。

## 9. 想定する掲示板と系統

| 系統 | 掲示板 | 解析の形 | 差分の取り方 | 段階 |
|---|---|---|---|---|
| 2ch互換 | 5ch、おーぷん、ぜろちゃんねるプラス系 | 既存のパーサ | 既存 | 1 |
| JSON の API | 4chan | `json` | `full` と条件付き取得 | 3 |
| 組み合わせ | ふたば | `html` + `json` | `since` | 4 |
| ページ送りの HTML | Steam、ニコニコ大百科 | `html` + `unwrap`・`groupBy` | `page` | 4・5 |
| 木構造 | Reddit | 認証なしは RSS（Atom）のみ。`json` + `children` は OAuth 前提 | `full` | 認証なしの JSON は403（2026-10-29 確認）。RSS は約60秒に1要求。`xml` 形式を足すか §11 で決める |
| 対象外 | JS で描画する掲示板、サービスを終えた掲示板 | — | — | — |

## 10. 段階と完了条件

### 段階0: 掲示板アダプタの登録制

- `BbsAdapter` と登録の仕組みを chlib に作り、既存の4系統（2ch系・まちBBS・したらば・bbspink）を組み込みのアダプタとして登録する。
- `parseThread`・`getThreadXhrInfo`・`BoardParser`・`classifyBoardHost`・`ThreadFetchPolicy` の `tsld` 分岐を、アダプタへの問い合わせに置き換える。
- 次の箇所が、レス番号を配列の位置から決めているか、`resLength` を差分の開始位置に使っているかを調べて、一覧を本書に記録する（段階5の準備）: `Thread.ts` のキャッシュと差分、アンカーの解決、NG、既読位置、お気に入りのレス数、MCP の読み取り。
- 完了条件: 利用者から見た動作が変わらない。既存のテストがすべて通る。`pnpm exec vp check` が通る。

### 段階1: 2ch互換の自動追加

- 許可されていないホストの URL でも、`/test/read.cgi/{板}/{キー}/` の形なら、`SETTING.TXT` か dat を試しに取得する。2ch互換と判定できたら、利用者に確認してから互換ホストとして保存する。
- 保存したホストは `classifyBoardHost` で `ch-style` として扱う。
- 完了条件: ローカルの HTTP 応答で、判定・保存・再起動後の利用を確かめる単体テストが通る。

### 段階2: スキーマ・検証・エンジン（`lines`・`json`）

- §5 の型、zod のスキーマ（`jitless: true`）、JSON Schema の出力。
- chlib に re2js・json-p3・url-template・urlpattern-polyfill を入れ、§6 の `regex.ts`・`json-path.ts`・`template.ts`・`url-match.ts` で包む。定義の処理からこれらを直接 import しない（制限の検査を必ず通すため）。
- テンプレート、JSON のパス、値の加工、`unwrap`（`json` だけ）、ページ送り、重複の除去、並べ直し、`ParsedThread` への変換。
- 完了条件: ふたばの JSON、ふたポ、4chan の catalog・threads・スレの JSON をテスト用データにして、期待する結果になる単体テストが通る。テスト用データの URL・名前・本文は架空のものに置き換える。

### 段階3: 定義アダプタの組み込み

- 定義から `BbsAdapter` を作り、`Thread.ts`・`Board.ts` から使えるようにする。
- `ThreadRes` の拡張（§6）と、`replyTo` からアンカーを作る処理。
- 取得の間隔、条件付き取得、`full`・`since` の差分、`expired`、`meta.expiresAt` による自動更新の停止。
- 板の `stats` をお気に入りの更新確認に使う経路。既存の subject.txt による更新確認（`src/core/board/Board.ts`）と同じ入口にそろえる。
- 定義の保存場所と読み込み（設定画面はまだ作らず、JSON の読み込みだけ）。
- 完了条件: 4chan の定義を読み込み、板一覧・スレ表示・自動更新・お気に入りの更新確認が動く。E2E はローカルの応答で行う。

### 段階4: `html` 形式

- 軽量な HTML パーサの導入、Worker での実行と時間制限。
- `groupBy`、`ItemGroup`、`unwrap` の `script`、`message.rewrite`、引用の照合（`replyResolve` の `quote`）。
- 完了条件: ふたば（初回は HTML、差分は JSON）、Steam、ニコニコ大百科（`initialRange: "all"` で）のテスト用データで単体テストが通る。§8 の（未確認）をすべて確かめ、本書を更新する。

### 段階5: 途中が抜けたスレッド

- `latest` と `initialRange` による初回の取得。`ParsedThread.gaps`。
- 段階0で調べた箇所を、レス番号を `number` から読む形に直す。
- 表示: 抜けている範囲を「31〜6030 は未取得」の区切りとして出し、押すと読み込む。
- 完了条件: 抜けのあるスレで、アンカー・NG・既読位置・自動更新が正しく動く。E2E で確かめる。

### 段階6: 定義エディタ

- 設定画面に定義の一覧、読み込み、書き出し、有効・無効、最後に成功した日時を出す。
- Monaco に JSON Schema を渡したエディタ。
- プレビュー: URL を入れて取得し、解析結果と、項目ごとに値が取れた件数を表示する。取得した応答と結果をテスト用データとして保存できる。
- 完了条件: 定義を書いてプレビューし、保存して開く流れが E2E で通る。

## 11. 判断が必要な点

| 項目 | 選択肢 | 推奨 |
|---|---|---|
| HTML パーサ | htmlparser2 + css-select / linkedom / Worker を使わず `DOMParser` | htmlparser2 + css-select。Worker と MCP で動き、依存が軽い |
| 検証ライブラリ | zod v4 / valibot / 手書き | zod v4。`toJSONSchema` で Monaco の補完まで1か所から作れる。CSP のため `jitless: true` で使う（§5） |
| 正規表現 | re2js / 標準の `RegExp` と Worker の時間制限だけ | re2js。ReDoS が構造上起きない。先読み・後方参照が使えないのは、定義の用途なら困らない |
| JSON のパス | json-p3 / jsonpath-rfc9535 / 自前の部分集合 | json-p3。RFC 9535 準拠で更新が続いている。jsonpath-rfc9535 は 2025-04 から更新がない |
| URLPattern を Firefox で使う方法 | `urlpattern-polyfill` / Firefox の最小版を 142 に上げる | polyfill。最小版を上げる判断は、ほかの理由と合わせて別にする |
| 式言語（`pipe` で足りなくなったとき） | 入れない / CEL（`@marcbachmann/cel-js`） | 入れない。必要になったら、CEL を構文の深さとASTの大きさを制限して使う案から検討する |
| 第三者のサービス（ふたポ） | 組み込みの定義の取得元に入れる / 利用者が追加する | 利用者が追加する。運営元の利用条件と負荷を確かめられないため |
| Reddit（認証なしの JSON が403） | 対象外にする / `xml`（Atom）形式を足して RSS で読む / OAuth を使う | 対象外にして、段階2〜4が終わってから再検討する。RSS は約60秒に1要求で、実況や自動更新に向かない。OAuth は定義だけで完結しない |
| プライベートアドレスへの通信 | 既定で拒否 / 確認して許可 / 制限なし | 既定で拒否し、定義ごとに許可できるようにする |
| 定義の保存と同期 | 設定と同じ保存先 / IndexedDB | 設定と同じ保存先。書き出し・読み込みで共有する |
| 途中が抜けたスレ | 段階5で対応 / 対応せず全件を取る | 段階5で対応。ニコニコ大百科のような長いスレでは全件の取得が現実的でない |

## 12. 使うパッケージと見送ったパッケージ

2026-10-29 に npm レジストリ、OSV（脆弱性データベース）、各リポジトリの README とソース、MDN の互換性データで確かめた。採用する前に、版と脆弱性をもう一度確かめる。

### 使う

| パッケージ | 確かめた版 | 用途 | 確かめたこと |
|---|---|---|---|
| re2js | 2.9.1 | 正規表現 | 純 JS（wasm でない）で、入力の長さに対して線形の時間で終わる。後読みの処理で入力の長さの2乗に比例して遅くなる不具合（GHSA-gg6h-894w-4m9c）が 2.8.7 で直っている。後読みは `LOOKBEHINDS` のオプションを付けたときだけ有効になるので、付けない |
| json-p3 | 3.0.1 | JSON のパス | RFC 9535 の適合テストで検証している。OSV の脆弱性は0件。フィルタ式の評価方法は README に書かれていないが、本計画ではフィルタ式を拒否するので影響しない |
| url-template | 3.1.1 | 取得元の URL | RFC 6570 のすべての段階に対応する。最後の更新は 2023-12 で、規格が固まっているため更新が少ないと見ている |
| urlpattern-polyfill | 10.1.0 | Firefox 142 未満の `URLPattern` | — |
| zod | 4.6.7 | 定義の検証と JSON Schema | `new Function` が使えるかを試す処理は、`jitless: true` のときは行わない（ソースのコメントで確認） |
| htmlparser2・css-select | 12.0.0・7.0.0 | `html` 形式 | OSV の脆弱性は0件 |
| date-fns・@date-fns/tz | — | `parse_date` | §8 の書式（`yy/MM/dd(EEE)HH:mm:ss`）は date-fns の書式そのまま。`EEE` が漢字の曜日なので ja のロケールが要る |

### 見送った

| パッケージ | 理由 |
|---|---|
| jsonpath-plus | フィルタ式の評価が原因の RCE が2件ある（CVE-2024-21534 は 10.2.0 で修正、CVE-2025-1302 は 10.3.0 で修正）。今も、フィルタ式を独自の小さなスクリプト処理系で評価する作り |
| JSONata | 細工した式で任意のコードを実行できる脆弱性が 2026 年に3件（2.2.1 で修正）、資源を使い尽くす脆弱性が1件ある。利用者が書いた式を評価させる用途には向かない |
| re2-wasm などの wasm 版 | 拡張機能の CSP に `'wasm-unsafe-eval'` がない |
| scrape-it | 宣言的に書けるが、値の変換を JS の関数で書く。利用者が書いた JSON だけで完結しない |
| x-ray | 2019 年から更新がない |

宣言的な定義で掲示板やサイトを読む仕組み全体を、そのまま使えるパッケージは見つからなかった。近い設計の例として、Huginn の WebsiteAgent（Ruby）と RSS-Bridge の CSS セレクタ系のブリッジ（PHP）がある。スキーマの項目を比べる材料にする。
