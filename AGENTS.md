## AGENTS.md

### Project Overview

これは、TypeScriptとSCSSを使用して構築された5ch互換掲示板ブラウザ拡張機能（ChromeおよびFirefox）です。

*   **パッケージマネージャ:** pnpm
*   **ビルドシステム:** Gulp + Rolldown (Rollupの後継)
*   **言語/テンプレート:** TypeScript, SCSS, Pug
*   **テスト環境:** Playwright (E2Eテスト)

### Building instructions

ビルドとウォッチはGulpタスクを通じて実行されます。変更をコミットする前に、Rolldownが正常に完了し、エラーが出ていないことを確認してください。

*   **Chrome向け開発ビルドを実行:**
    ```bash
    pnpm run build:chrome
    ```
*   **Firefox向け開発ビルドを実行:**
    ```bash
    pnpm run build:firefox
    ```
*   **開発中にファイルの変更を監視（Chrome用）:**
    ```bash
    pnpm run watch:chrome
    ```
*   **すべてのファイルとバンドルをクリーンアップ:**
    ```bash
    pnpm run clean
    ```
*   **すべてのビルドとパッケージの作成:**
    ```bash
    pnpm run pack:all
    ```

### Testing instructions

すべてのコード変更は、自動テストとリンティングチェックをパスする必要があります。

*   **すべてのテスト（Playwright E2E）を実行:**
    ```bash
    pnpm test
    ```
*   **Playwright UIモードでテストを実行 (デバッグ用):**
    ```bash
    pnpm test:ui
    ```
*   **リンティングとコードフォーマットを修正:**
    ```bash
    pnpm lint
    ```
*   **TypeScriptの型チェック:**
    ```bash
    pnpm tsc
    ```

> **注意:** 拡張機能のテストは、`tests/fixtures.mts`で定義されたカスタムPlaywrightフィクスチャを使用し、ローカルの`debug/chrome`ディレクトリをロードして実行されます。テスト失敗の原因が拡張機能の読み込みにある場合は、フィクスチャ定義を確認してください。

### Coding Conventions

*   **ファイルの種類:** `src/app/`以下のコアロジックはTypeScriptで記述します。
*   **SCSS:** `src/_common.scss`に共通の変数とミックスインが定義されています。UIのスタイル調整時にはこれを参照してください。
*   **HTMLテンプレート:** Pug形式（`.pug`）で記述されています。HTMLへの変換はビルド時に行われます。
*   **`src/app.ts` の `config`:** iframeのコンテキスト内外で設定に安定してアクセスするためにProxyが使用されています。設定値の読み書きの際は、このProxy機構を意識して修正してください。

### New Feature Highlights (Context for Recent Changes)

AIエージェントが最近導入された機能に取り組む際は、以下のファイルの変更点を参照してください。

*   **NG/ハイライト機能の拡張:**
    *   `src/core/NG.js`: NGワードにスコープ（適用範囲）とハイライト用パラメータ（`bgColor`, `label`）が追加されました。
    *   `src/core/Board.js`: NGチェックの結果に基づき、スレッド一覧でハイライトを適用するロジックが追加されました。
*   **ビルドシステムの移行:**
    *   `gulp/config.js`, `gulp/js.js`, `gulp/plugins.js`: Rollup関連の参照はすべてRolldownに置き換えられました。バンドルに関する問題をデバッグする場合は、これらの設定ファイルを参照してください。
*   **メディアズームの改善:**
    *   `src/ui/MediaContainer.js`: サムネイルズームが「ホバー」だけでなく「クリックトグル」でも動作するように拡張されました。設定名も`hover_zoom_*`から`zoom_*_mode`に変更されています。

### PR instructions

*   **Title format:** `[<module_name>] <Descriptive Title>` (例: `[thread] Add filter functionality`)
*   **Pre-commit check:** `pnpm lint` および `pnpm test` を必ず実行し、変更がクリーンであることを確認してください。
*   **コミットメッセージ:** 変更の意図が明確になるよう、詳細な説明を含めてください。
