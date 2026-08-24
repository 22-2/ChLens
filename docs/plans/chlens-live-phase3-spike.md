# Chlens Live Phase 3 実装記録

## 目的

Phase 3では、NGルールの記法・評価・保存境界をChlens本体とChlens Liveで共有できる形に整理した。既存Chlensの判定結果と設定キーは維持し、Live側は独立した保存領域を使う。

## 実装内容

- `packages/ch-lib/src/rules/`を共有ルール実装の正規境界にした。
  - DSLの解析・検証、正規化、カタログ、スコープ判定、ルール評価を集約。
  - `evaluateBoardRules`と`evaluateResponseRules`で、板一覧とレス一覧の許可対象を型付きAPIとして分離。
  - `RuleRepository`で同期ロードと非同期保存を抽象化。
- Chlens本体は`src/core/rules/`を互換ファサードにし、既存の`config`設定領域の`ngwords`キーをアダプター経由で利用する。
- Chlens Liveは`LocalStorageLiveRuleRepository`を追加し、`chlens-live.rules.v1`へ保存する。これにより本体の`config_ngwords`と混ざらず、後続フェーズでSQLiteへ差し替えられる。
- Monaco用の言語定義、補完候補、色プリセットを共有パッケージから供給する。Monaco固有型はアプリ側に閉じ込め、共有パッケージがUI実装へ依存しないようにした。

## 検証

- `@chlen/ch-lib`: 45 tests passed。
- Chlens本体のNG既存・特性テスト: 29 tests passed。
- Chlens Liveリポジトリテスト: 2 tests passed。
- `pnpm tsc6 --noEmit --pretty false`: passed。
- `@chlen/ch-lib`と`chlens-live`の`vp check`: passed。

`pnpm lint`は、既存の`organize-imports-cli`がTypeScript 6のAPI変更により`sourceFile`未定義で落ちるため完走しなかった。Oxlint・トークン検査・フォーマット検査は実行され、既存警告以外のエラーは発生していない。

## 次フェーズへの境界

Phase 3では保存先をLiveへ接続したが、画面からの編集導線やSQLite永続化は後続フェーズの対象とする。SQLite実装へ移行する場合も、`RuleRepository`を実装してLiveアダプターを置き換える。
