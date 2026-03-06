# React 移行ガイド - view/thread

## 概要

view/thread を Pug から React に段階的に移行するための基盤を構築しました。

## 作成したファイル

### React コンポーネント

- `src/view/thread/index.tsx` - エントリーポイント
- `src/view/thread/ThreadView.tsx` - メインビューコンポーネント
- `src/view/thread/components/ThreadNavBar.tsx` - ナビゲーションバー（lucide-react 使用）
- `src/view/thread/components/ThreadContent.tsx` - コンテンツ（プレースホルダー）
- `src/view/thread/components/ThreadFooter.tsx` - フッター（プレースホルダー）

### テンプレート

- `src/view/thread_react.pug` - React 版の HTML テンプレート

## ビルド設定の変更

### gulp/config.js

- `paths.js.threadReact` を追加
- Rolldown の`resolve.extensions`に`.tsx`, `.jsx`を追加

### gulp/js.js

- `getRolldownIOConfigs`に`threadReact`ケースを追加
- `threadReact(browser)`関数を追加
- `js:${browser}`タスクに`threadReact(browser)`を追加

### tsconfig.json

- `jsx: "react-jsx"`を追加

## 使用ライブラリ

- React 19.2.4
- react-dom 19.2.4
- lucide-react (アイコン)
- clsx, tailwind-merge, class-variance-authority (shadcn/ui 用)

## アクセス方法

React 版のスレッドビューは以下の URL でアクセスできます：

```
/view/thread_react.html?q=<スレッドURL>
```

従来の Pug 版は引き続き以下で利用可能：

```
/view/thread.html?q=<スレッドURL>
```

## 次のステップ

1. **既存機能の移行**

   - レスメニュー機能
   - ポップアップ表示
   - 検索・フィルター機能
   - 自動更新機能
   - ライブスタイルモード

2. **shadcn/ui コンポーネントの追加**

   - Button, Input, Dropdown Menu 等の基本コンポーネント
   - `components.json`の設定
   - Tailwind CSS の統合

3. **状態管理の実装**

   - React Context または Zustand
   - スレッドデータの管理
   - UI 状態の管理

4. **パフォーマンス最適化**
   - 仮想スクロール（react-window 等）
   - メモ化（useMemo, useCallback）
   - コード分割

## 注意事項

- 現在の React 版は基本的な構造のみで、既存の thread.js の機能はまだ移行されていません
- 既存の UI.ThreadContent 等のクラスと連携する必要があります
- CSS は既存の thread.scss を引き続き使用しています
