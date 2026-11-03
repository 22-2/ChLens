import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback } from "react";
import type { IRes } from "src/service-container";

/**
 * ポップアップ内のレスを右クリックした時の共通処理。
 *
 * 右クリックの mousedown では、テキスト選択を消さないよう配下の子孫ポップアップを畳まない。
 * 選択が確定した contextmenu のこの時点で子孫を畳んでから、スタック管理側のメニューを開く。
 */
export function usePopupResContextMenu(
  onResContextMenu: (targetRes: IRes, event: ReactMouseEvent) => void,
  onPopupMouseDown?: () => void,
) {
  return useCallback(
    (event: ReactMouseEvent, targetRes: IRes) => {
      event.stopPropagation();
      onPopupMouseDown?.();
      onResContextMenu(targetRes, event);
    },
    [onResContextMenu, onPopupMouseDown],
  );
}
