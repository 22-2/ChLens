## AGENTS.md

### Project Overview

これは、TypeScript (React) と SCSS を使用して構築された 5ch 互換掲示板クライアントです。
ブラウザ拡張機能（Chrome/Firefox）およびデスクトップアプリ（Tauri）として動作します。

*   **パッケージマネージャ:** pnpm
*   **ビルドシステム:** Vite
*   **言語/UIライブラリ:** TypeScript, React, SCSS, Pug (HTMLテンプレート用)
*   **プラットフォーム:** Chrome, Firefox, Tauri
*   **テスト環境:** Vitest (ユニットテスト), Playwright (E2Eテスト)

### Building instructions

ビルドは Vite を通じて行われます。`PLATFORM` 環境変数でターゲットを指定します。

*   **Chrome 向けビルド:**
    ```bash
    pnpm run build:chrome
    ```
*   **Tauri (Windows) 向けビルド:**
    ```bash
    pnpm run build:tauri
    ```
*   **Firefox 向けビルド:**
    ```bash
    pnpm run build:firefox
    ```
*   **開発中のウォッチモード (Chrome):**
    ```bash
    pnpm run watch:chrome
    ```
*   **すべてのビルドとパッケージの作成:**
    ```bash
    pnpm run pack:all
    ```

### Architecture & Design Decisions

*   **単一ビューへの集約:** 以前は複数のビュー（bookmark, thread等）がありましたが、現在は `src/view/browser` (Reactベース) に全ての機能が統合されています。
*   **グローバル `app` の廃止:** レガシーな `window.app` への直接参照は非推奨です。新しいモジュールは ES module インポートを使用してください。
*   **サービスコンテナ:** 依存注入（DI）には `src/service-container/` を使用しています。
*   **スタイル管理:** 全てのスタイルは `src/bundle.scss` に集約され、ビルド時に単一の CSS ファイルとして出力されます。
*   **Tauri シム:** Tauri 環境では拡張機能 API が存在しないため、`src/browser-shim.js` を通じてシムを提供しています。

### Coding Conventions

*   **ES Modules:** 名前付きエクスポートを優先してください。
*   **型定義:** `any` の使用は避け、厳密な型定義を心がけてください。
*   **プラットフォーム抽象化:** ストレージや通信などのプラットフォーム固有の機能は `src/app/platform/` 以下のインターフェースを通じて利用してください。
*   **意図の明文化:** バグ修正や意図的な変更を行う際は、コード内に「なぜそのように書いたか」という背景をコメントとして残してください。

### PR instructions

*   **Title format:** `[<module_name>] <Descriptive Title>` (例: `[thread] Add filter functionality`)
*   **Pre-commit check:** `pnpm lint` および `pnpm tsc` を実行し、型エラーやリンターエラーがないことを確認してください。
*   **コミットメッセージ:** 変更の意図が明確になるよう、詳細な説明を含めてください。
