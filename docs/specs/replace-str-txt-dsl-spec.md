# ReplaceStrTxt 置換DSL仕様案

Status: Draft

## 1. 目的

レスの名前・メール欄・日付欄・本文に対する文字列置換を、手作業で編集しやすい設定として提供する。

主な利用例は次のとおり。

- 本文先頭に混入する `https://img.5ch.io/ico/001.gif` の行を削除する。
- `http://jump5.ch/?<URL>` のラッパーを取り除き、内側のURLだけを表示する。
- 特定の板・スレッドだけに置換を適用する。
- 単純な文字列置換と正規表現置換を使い分ける。

## 2. 現行仕様

現行実装は次のファイルに分散している。

- `src/core/ReplaceStrTxt.js`: 設定・キャッシュ・アプリケーションとの接続
- `packages/ch-lib/src/parser/ReplaceStrParser.ts`: 旧形式のパースと置換実行
- `src/core/ThreadModel.js`: レス追加時の適用

レスがモデルへ追加される直後に置換され、その後にAA判定・メタデータ解析・アンカー解析・NG判定が行われる。

### 2.1 旧形式

1行1ルールのタブ区切り形式である。

```text
[<方式>]置換前<TAB>置換後<TAB>対象<TAB><URL条件>URLまたはタイトル
```

例:

```text
名無し<TAB>匿名<TAB>name
<rx>ID:([A-Za-z0-9]+)<TAB>ID:伏せ字<TAB>msg
荒らし<TAB>[削除済み]<TAB>msg<TAB><0>example.com
```

対象は次のとおり。

| 値     | 対象                  |
| ------ | --------------------- |
| `name` | 名前                  |
| `mail` | メール欄              |
| `date` | 日付などの `other` 欄 |
| `msg`  | 本文                  |
| `all`  | 上記4項目すべて       |

方式は次のとおり。

| 方式        | 意味                                                           |
| ----------- | -------------------------------------------------------------- |
| 省略 / `ex` | リテラル置換。現行実装では大文字小文字を無視                   |
| `rx`        | 正規表現。`g` フラグ                                           |
| `rx2`       | 正規表現。`ig` フラグ                                          |
| `ex2`       | 実行分岐は存在するが、現行パーサーでは未知方式として除外される |

URL条件の番号は次のとおり。

| 番号  | 条件                                    |
| ----- | --------------------------------------- |
| `<0>` | URLまたはタイトルに含む                 |
| `<1>` | URLまたはタイトルに含まない             |
| `<2>` | URLまたはタイトルと完全一致             |
| `<3>` | URLまたはタイトルと完全一致しない       |
| `<4>` | URLまたはタイトルが正規表現に一致       |
| `<5>` | URLまたはタイトルが正規表現に一致しない |

### 2.2 現行形式の制限

- 区切りがタブなので、人間が編集すると壊れやすい。
- URL条件の `<0>`〜`<5>` が分かりにくい。
- 本文の「行」が改行文字なのか `<br>` なのかをDSLが表現できない。
- パーサーの正規表現が置換後文字列を必須としているため、空文字への置換を直接記述できない。
- 不正な正規表現を含むルールは、現在は診断を返さず除外される。
- `ReplaceStrParser` がパースと実行を兼ねている。
- 起動時は `replace_str_txt_obj` ではなく `replace_str_txt` を再パースしている。

## 3. 新DSLの方針

新DSLは、既存NG DSLと同じブロック形式を採用する。

- 区切りは空白とインデントを基本にする。
- 値は引用符で囲む。
- 正規表現のバックスラッシュは保持する。
- 行番号・列番号付きの診断を返す。
- 置換ルールと実行エンジンを構文から分離する。
- 旧形式は互換用パーサーとして残す。

新DSLから旧形式の文字列へ変換して既存パーサーへ渡す方式は採用しない。旧形式の制約が新DSLへ漏れ、行削除や空文字置換を表現できなくなるためである。

## 4. 新DSL構文

置換の基本形は次のとおり。方式は省略可能で、省略時は `literal` とする。

```text
replace <対象> [literal|regex] [flags=<フラグ>]:
  from "置換前"
  to "置換後"
```

### 4.1 通常の文字列置換

```text
replace body literal:
  from "ｗｗｗ"
  to "（笑）"
```

`literal` の既定値は大文字小文字を区別する。無視する場合は `flags=i` を指定する。

```text
replace name literal flags=i:
  from "名無し"
  to "匿名"
```

### 4.2 正規表現置換

```text
replace body regex:
  from "ID:([A-Za-z0-9]+)"
  to "ID:伏せ字"
```

正規表現の置換後文字列では `$1` などのキャプチャ参照を利用できる。

```text
replace body regex:
  from "http://jump5\.ch\?(https?://[^<>\s]+)"
  to "$1"
```

### 4.3 行削除

行削除は空文字置換の省略形ではなく、独立した操作として扱う。

```text
remove body line first:
  equals "https://img.5ch.io/ico/001.gif"
```

これは本文を論理行へ分割し、先頭行が指定文字列と一致した場合に、その行と行区切りを削除する。

### 4.4 適用条件

URLとタイトルを別々の条件として記述する。

```text
replace body:
  from "荒らし"
  to "[削除済み]"
  when url contains "example.com"
```

```text
replace body regex:
  from "実況"
  to ""
  when title contains "実況"
```

複数の `when` はAND条件とする。否定条件は `unless` で表現する。

```text
replace body:
  from "sage"
  to ""
  unless url contains "example.com"
```

## 5. 意味モデル

DSLは、次のような構文非依存のルールへ変換してから実行する。

```ts
interface ReplacementRule {
  readonly operation: "replace" | "remove";
  readonly unit: "text" | "line";
  readonly target: "name" | "mail" | "date" | "body" | "all";
  readonly matcher:
    | {
        readonly kind: "literal";
        readonly source: string;
        readonly flags?: string;
      }
    | {
        readonly kind: "regex";
        readonly source: string;
        readonly flags: string;
      };
  readonly replacement?: string;
  readonly conditions: readonly ReplacementCondition[];
  readonly firstOnly?: boolean;
}

interface ReplacementCondition {
  readonly field: "url" | "title";
  readonly operator: "contains" | "equals" | "regex";
  readonly value: string;
  readonly negate?: boolean;
}
```

ルールは記述順に適用する。前のルールによる置換結果を、後のルールが入力として受け取る。

`remove` は内部的には空文字への置換として実行できるが、ユーザー向けDSLでは意図を明確にするため独立した操作として保持する。

## 6. 本文の論理行

本文はBBSごとに改行表現が異なるため、`line` 操作では次を論理行区切りとして扱う。

- `\r\n`
- `\n`
- `<br>`
- `<br/>`
- `<br />`

行削除時は、削除対象の内容と隣接する行区切りをまとめて処理し、先頭行・中間行・末尾行で空行が不必要に残らないようにする。

置換対象は、既存のリンク化や表示用HTML変換より前の `res.message` とする。これにより、`jump5.ch` のラッパー除去後に通常URLとしてリンク化できる。

## 7. 実装構成

```text
packages/ch-lib/src/replacement/
├── model.ts       # ReplacementRuleなどの型
├── dsl.ts         # 新DSLのparse・format・診断
├── legacy.ts      # 旧ReplaceStr.txtの読み込み
├── engine.ts      # ルールの適用
└── index.ts
```

`src/core/ReplaceStrTxt.js` は設定保存・キャッシュ・アプリケーションとの接続だけを担当する。

```text
旧ReplaceStr.txt ── legacy parser ─┐
                                  ├─ ReplacementRule[] ─ engine ─ レス
新しいDSL ─────── DSL parser ─────┘
```

`packages/ch-lib` に置く理由は、置換のモデル・パーサー・実行エンジンをChrome、Firefox、Tauriで共通利用できるためである。

## 8. 旧形式との互換

旧形式は次のように新しい意味モデルへ変換する。

| 旧形式       | 新形式                  |
| ------------ | ----------------------- |
| `ex`         | `literal` + `flags=i`   |
| `rx`         | `regex` + `flags=g`     |
| `rx2`        | `regex` + `flags=ig`    |
| `name`       | `name`                  |
| `mail`       | `mail`                  |
| `date`       | `date`                  |
| `msg`        | `body`                  |
| `all`        | `all`                   |
| `<0>`〜`<5>` | URL/titleの明示的な条件 |

旧形式の設定は読み込み可能にする。新形式で保存した後に、旧形式へ戻す必要はない。

設定形式の判定には、次のいずれかを用いる。

- `replace_str_txt_format` に `legacy` / `dsl-v2` を保存する。
- 形式キーがない場合は旧形式として扱う。

`replace_str_txt_obj` は実行用キャッシュとしては廃止し、正規表現オブジェクトを永続化しない。

## 9. エラー処理

パース結果は次の形で返す。

```ts
interface ReplacementDslParseResult {
  readonly recognized: boolean;
  readonly rules: readonly ReplacementRule[];
  readonly diagnostics: readonly {
    readonly line: number;
    readonly column: number;
    readonly message: string;
  }[];
}
```

次のエラーは保存前に検出する。

- 未知の操作・対象・オプション
- `from` / `to` / `equals` の不足
- 不正な正規表現
- 不正な正規表現フラグ
- `line` 操作に対応しない対象の指定
- 条件の値不足

エラーを含む設定は適用せず、行番号・列番号・理由をUIへ返す。実行時に予期しないエラーが発生した場合はログへ出力する。

## 10. テスト観点

- リテラル置換、大小文字オプション
- 正規表現置換と `$1` などのキャプチャ参照
- `name` / `mail` / `date` / `body` / `all`
- URL条件とタイトル条件、否定条件、複数条件
- `\n` と `<br>` の先頭行削除
- 中間行・末尾行の削除
- `to ""` による空文字置換
- 旧形式から新しい意味モデルへの変換
- 新DSLのparse/formatのラウンドトリップ
- 不正入力の診断内容
- 置換後にURLリンク化・アンカー解析・NG判定が行われること

## 11. 実装順

1. `ReplacementRule` と条件の型を追加する。
2. 旧形式を意味モデルへ変換する `legacy.ts` を追加する。
3. 置換処理を `engine.ts` へ移す。
4. `line` 操作と空文字置換を実装する。
5. 新DSLのパーサーと診断を実装する。
6. `src/core/ReplaceStrTxt.js` の設定・キャッシュ処理を新エンジンへ接続する。
7. 設定画面に入力欄、検証結果、旧形式からの変換導線を追加する。
8. 既存の旧形式テストと新DSLテストを追加する。
