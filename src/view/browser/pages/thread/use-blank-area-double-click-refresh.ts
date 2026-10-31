import { type MouseEvent as ReactMouseEvent, useCallback } from "react";

/** 本文の空白部分のダブルクリックで再読み込みする。リンクや画像、テキスト選択中は対象外。 */
export function useBlankAreaDoubleClickRefresh({
  canRefresh,
  viewWindow,
  requestManualRefresh,
}: {
  canRefresh: boolean;
  viewWindow: Window;
  requestManualRefresh: () => void;
}) {
  // 空白部分のダブルクリックによる更新。
  // 設定項目は持たず常に有効にする。誤操作防止のためリンクや画像、テキスト選択中などは除外する。
  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      const target = e.target as HTMLElement;

      // リンク、画像、入力系要素、ボタンなどは除外
      if (
        target.closest("a, button, input, textarea, .res__thumb, .res__media-embed, .res__link")
      ) {
        return;
      }

      // テキスト選択中はリロードしない
      if (!canRefresh || viewWindow.getSelection()?.toString()) return;

      requestManualRefresh();
    },
    [requestManualRefresh, canRefresh, viewWindow],
  );
  return handleDoubleClick;
}
