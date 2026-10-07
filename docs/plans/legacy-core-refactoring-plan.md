# レガシーコア層リファクタリング計画

## 目的

`src/core/` と [`src/app.ts`](../../src/app.ts) に残る read.crx 由来のレガシー構造を、既存の挙動を変えずに段階的に ES module とサービスコンテナ中心の構成へ寄せる。

主目的は行数削減ではなく、次の3点である。

- 暗黙のグローバル `window.app` への依存をなくし、依存関係を import から読めるようにする。
- `src/core/` → `src/app.ts`（合成ルート）への逆向き import をなくし、循環参照を解消する。
- JS ファイルを TS へ移し、`any` や JSDoc の型注釈に頼らない厳密な型にする。

## 現状（第1段階着手前）

### `window.app` の構成

`src/app.ts` が `appObj` を作り、`src/app/*` のヘルパー（`log`、`deepCopy`、`Callbacks`、`message` など）と `src/core/*` のモジュール約25個を `Object.assign` で載せている。`app.boot()` の中で `setupContainer(window.app)` を呼び、サービスコンテナの各アダプタはこの `window.app` を経由して実装へ委譲している。

ビュー側が `window.app` 経由で core モジュールを参照している箇所はほぼなく（`app.boot` と `app.message` 程度）、core モジュールの多くは各所から直接 import されている。つまり `Object.assign` で載せている core モジュールの大半は、実際には `window.app` 経由では使われていない。

### core 内部の暗黙グローバル参照

| 参照 | 主な利用箇所 | 第1段階後 |
| --- | --- | --- |
| `app.deepCopy` / `app.Callbacks` / `app.log` | `BookmarkEntryList`、`BrowserBookmarkEntryList`、`IDBBookmarkEntryList` | `src/app/*` を直接 import |
| `app.util.isNewerReadState` | `BookmarkEntryList` | `src/core/read-state-compare.ts` を import |
| `app.replaceAll` | `jsutil.js` | `String.prototype.replaceAll` |
| `app.message` | `jsutil.js`、`ImageReplaceDat.js`、`BoardTitleSolver.ts` | `container.message` |
| `app.config` | `ImageReplaceDat.js`、`ReplaceStrTxt.js`、`URL.ts` | `container.config` |
| `app.defer` | `BoardTitleSolver.ts` | `src/app/Defer` を直接 import |
| `app.bookmark` | `BoardTitleSolver.ts` | **残存**（第2段階） |

### core → `src/app.ts` の逆向き import

`Thread.ts`、`Board.ts`、`Cache.ts`、`HTTP.ts` が `platform` を、`History.ts`、`Bookmark.ts`、`WriteHistory.ts` が `message` を `src/app` から import している。`src/app.ts` 自身がこれらの core モジュールを import しているため循環しており、モジュール評価順に依存した壊れやすい構造になっている。

### 残っている JS ファイル

`BBSMenu.js`、`ImageReplaceDat.js`、`ReplaceStrTxt.js`、`SikiGuard.js`、`ThreadSearch.js`、`ThreadService.js`、`jsutil.js`（と `MessageProcessor.test.js`、`jsutil.test.js`）。

## 設計方針

1. 各段階で挙動変更を行わない。挙動を変えるべき不具合を見つけた場合は、理由をコメントに残したうえで個別のコミットに分ける。
2. 依存の向きは「ビュー → サービスコンテナ → core → `src/app/*`（Log、Util、Callbacks、Message、Defer、platform）」に揃える。core から `src/app.ts` は import しない。
3. 状態を持たない純粋なヘルパーは `src/app/*` から直接 import する。設定、メッセージ、ブックマークのように実行時に1つのインスタンスを共有するものはサービスコンテナ経由にする。
4. `window.app` の公開 API は、利用箇所が無くなったことを確認してから段階的に削る。

## 段階

### 第1段階: core 内部の暗黙グローバル参照を明示的な import に置き換える（着手済み）

- 上表のとおり `app.*` 参照を import / `container` に置き換える。
- 既読状態の比較 `isNewerReadState` を純粋関数として `src/core/read-state-compare.ts` へ切り出し、`jsutil.js` からは再エクスポートする。
- どこからも import されていなかった `src/core/core.js`（`src/app.ts` と同じ再エクスポートの重複）を削除する。
- `ThreadService.js` の未使用 import、`jsutil.js` の未使用関数 `__guard__` を削除し、`tsc` のエラーを0件にする。
- `BrowserBookmarkEntryList` で `log(err)` とエラーをログレベル引数へ渡していた不具合を直し、エラー詳細がログに残るようにする。

### 第2段階: ブックマークと既読状態をサービスコンテナへ寄せる

- [x] `IBookmark` に `promiseFirstScan` と `getAllBoards` を追加し、`BoardTitleSolver` の `app.bookmark` 参照をなくす。
- [x] `initializeBookmarkRuntime` をサービスコンテナのセットアップ側へ移し、`setupContainer` が `window.app` の各機能を経由せず実装を直接 import する。
- [x] `IUtil.isNewerReadState` の引数を `ComparableReadState` へ型付けする。

### 第3段階: core → `src/app.ts` の循環 import を解消する

- [x] `platform` と `message` を `src/app/platform`、`src/app/Message` から直接 import する。
- [x] `src/app.ts` は `window.app` の組み立てと `boot` を担う合成ルートにする。

### 第4段階: JS ファイルの TS 化

- 依存の少ない順（`ReplaceStrTxt` → `ImageReplaceDat` → `SikiGuard` → `ThreadSearch` → `ThreadService` → `BBSMenu` → `jsutil`）に TS へ移す。
- `jsutil.js` は責務ごと（アンカー解析、サーバー移転検出、文字列正規化、日付変換）に分割する。

### 第5段階: `window.app` の縮小

- [x] `Object.assign(appObj, {...})` で載せていたcoreモジュールのうち、`window.app` 経由の利用が無いものを外す。
- [x] `src/global.d.ts` の `namespace app` を実際に残るAPIへ縮める。
- [x] `LegacyAppForSetup` を削除し、`setupContainer` を引数なしにする。

### 第4段階の実施記録

- [x] `src/core/` に残っていたJS実装と `MessageProcessor.test.js`、`jsutil.test.js` をTypeScriptへ移した。
- [x] `jsutil` のアンカー解析、サーバー移転検出、文字列正規化、日付変換を責務別モジュールへ分け、既存import向けの `jsutil.ts` ファサードを残した。
- [x] IndexedDB要求のPromise化を独立モジュールへ移し、`ReadState` から直接利用する。
- [x] `jsutil.test.ts` にアンカー、半角カタカナの濁点、日付、旧ファサード経由の移転検出の回帰確認を追加した。
- [x] CIに全体のTypeScript型チェックと変更コードだけを対象とする `vp check` を追加した。追加・変更・rename先を対象にし、削除済みファイルと未変更ファイルの既存フォーマット差分を除外する。

### 第2・3・5段階の実施記録

- [x] ブックマークの初期化とサービスAPIをサービスコンテナへ移し、BoardTitleSolverからグローバル参照を除いた。
- [x] `src/core/` から `src/app.ts` を直接 import する依存を除き、platform/messageは専用モジュールから参照する。
- [x] 合成ルートの `window.app` から未使用のcoreモジュールを外し、`LegacyAppForSetup` と setupContainer引数を削除した。
- 残る互換APIは `src/app/*` の汎用ヘルパー、config/platform、boot時に公開するbookmark関連API、および利用箇所が残るHistory/ReadState/WriteHistory。
- CIでは型チェック、変更ファイルの `vp check`、ユニット/E2Eテスト、Chrome向けビルドを実行する。最新の実行結果は[PR #150のチェック](https://github.com/22-2/ChLens/pull/150/checks)を参照する。

## 検証

各段階で次を実行する。

- `pnpm exec tsc --noEmit -p .`（エラー0件を維持）
- `vp check`（このPRで触れていないファイルの既存のフォーマット差分は対象外）
- `vp test run`
- `pnpm run build:chrome`

CIでは `pnpm exec tsc --noEmit -p .` を全体へ実行する。`vp check` は [`scripts/check-changed-files.mjs`](../../scripts/check-changed-files.mjs) がGit差分から選んだコードファイルへ実行し、未変更ファイルの既存フォーマット差分を検査対象に含めない。ユニットテストとE2Eテストは既存jobで実行し、E2E jobのChrome向けビルドも維持する。最新の検証結果は[PR #150のチェック](https://github.com/22-2/ChLens/pull/150/checks)を参照する。
