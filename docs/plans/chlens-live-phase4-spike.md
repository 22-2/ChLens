# Chlens Live Phase 4 実装記録

## 目的

ThreadListの表示契約を取得元やタブ実装から分離し、Chlensの既存一覧とLiveの固定board一覧が同じView境界を使える状態にする。

## 実装内容

- `src/view/shared/ThreadListView.tsx`を追加した。
  - 検索入力、loading/error/empty状態、sort操作、row click・middle click・context menuのcallbackをpropsで受け取る。
  - Liveは標準テーブル、Chlensは既存`SimpleDataTable`をchildrenとして渡せるため、既存の列表示・セクション・コンテキストメニューを壊さず共有外枠へ移行した。
- `apps/chlens-live/src/app/use-thread-list-controller.ts`を追加した。
  - 固定boardの取得結果に対してタイトル検索、No./タイトル/レス数/勢いsortを適用する。
  - Phase 3の共通evaluatorでhide/highlight/demoteを判定する。
  - Live専用repositoryからルールを読むため、Chlens本体の設定とは独立している。
- LiveのThreadListを共有Viewへ接続し、Phase 4表示に更新した。

## 検証

- Chlens Live: 39 tests passed、`vp check` passed、build passed。
- Chlens ThreadList/ContentArea: 13 tests passed。
- Root TypeScript check: passed。

## 次フェーズへの境界

Phase 4では表示契約とLive一覧controllerを分離した。Chlens固有の列可視性、highlight section、bookmark/context menuは既存controller側に残しているため、Phase 5以降でThreadViewと同じ方式の共有化を進める。
