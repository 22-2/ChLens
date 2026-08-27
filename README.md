# ChLens

スクショ準備中

[![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)

ChLens は readcrx をフォークした、Web 技術で作られた 5ch 互換掲示板ブラウザです。
主に Chrome/Firefox 向け拡張とデスクトップアプリ（Tauri）として動作します。

**特徴**

- 5ch 系サービスや互換 BBS（2ch.sc, open2ch, まちBBS, したらば など）に対応
- TypeScript + React を中心としたモダンなフロントエンド構成
- 拡張機能と Tauri 両対応でデスクトップ/ブラウザ両方で利用可能

**サポートプラットフォーム**: Chrome, Firefox, Tauri

**主要技術スタック**: TypeScript, React, SCSS, Vite, pnpm

## クイックスタート

事前に `pnpm` がインストールされている必要があります。

```bash
git clone git://github.com/22-2/ChLens.git
cd ChLens
pnpm install
```

開発やビルドの主なコマンド:

```bash
# Chrome 拡張をビルド
pnpm run build:chrome

# Firefox 拡張をビルド
pnpm run build:firefox

# Tauri デスクトップアプリをビルド（Windows など）
pnpm run build:tauri

# 開発ウォッチ（Chrome 用）
pnpm run watch:chrome

# すべてのビルドとパッケージ作成
pnpm run pack:all
```

ビルド成果物を別のディレクトリへ自動コピーする場合は、`.env` にコピー先を指定します。
未設定の場合はコピーされません。

```dotenv
BUILD_COPY_DESTINATION=../read-crx-build
```

コピー対象は `debug/<platform>` のビルド成果物です。`platform` は Chrome / Firefox / Tauri の
ビルド対象に応じて変わります。

## 商用利用についての注意

このリポジトリ自体は MIT ライセンスですが、ChLens がアクセスする外部サービスやデータには別途利用規約・商用制限が存在する場合があります。商用利用時は各サービス規約を確認してください。

## 貢献ガイド

- PR のタイトル形式: `[<module_name>] <説明>`（例: `[thread] Add filter functionality`）
- `pnpm lint` と `pnpm tsc` を実行して型エラーやリンターエラーがないことを確認してください
- バグ修正や意図的な実装変更を行う際は、ソース内に「なぜそのようにしたか」の短いコメントを残してください

詳しい開発ルールやコントリビュート手順はプロジェクトの CONTRIBUTING.md（存在する場合）を参照してください。

AIによる`.todo`整理からGitHub Issue、実装、確認までの流れは、[ChatGPT Codex改善ループ移行ロードマップ](docs/plans/agentic-improvement-loop-migration.md)、[トリアージ手順](docs/workflows/codex-todo-triage.md)、[Issue実装手順](docs/workflows/codex-ready-issue.md)、`AGENTS.md`を参照してください。

## 謝辞

本プロジェクトは read.crx-2 の成果をベースにしています。オリジナルの作者並びにコミュニティに感謝します。

## ライセンス

MIT
