import React, { useCallback, useRef, useState } from "react";
import {
  clampTabBarWidth,
  TAB_BAR_COLLAPSED_WIDTH,
  TAB_BAR_WIDTH_MIN,
} from "src/features/tabs/browser/tab-bar-layout";

interface UseTabBarWidthResizeOptions {
  collapsed: boolean;
  width: number;
  /** 幅を確定する。expand が true なら縮小表示から展開へ移る。 */
  onCommitWidth: (width: number, expand: boolean) => void;
}

/** タブバー右端のハンドルによる幅の変更。操作中の幅だけを返し、確定時に一度だけ保存する。 */
export function useTabBarWidthResize({
  collapsed,
  width,
  onCommitWidth,
}: UseTabBarWidthResizeOptions) {
  // ドラッグ中は保存済み幅ではなく操作中の幅で描画し、確定時だけ保存する。
  // 移動のたびに保存すると書き込みが連続して重くなるため。
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragWidthRef = useRef<number | null>(null);
  const dragRawWidthRef = useRef<number | null>(null);
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 変更理由: タブのドラッグ並べ替えと幅変更の当たり判定が干渉しないよう、
      // 幅変更は右端の専用ハンドルだけで開始する。
      // 縮小時は48pxを起点にし、右へ引けば展開へ移れるようにする。
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      resizeStartRef.current = {
        startX: e.clientX,
        startWidth: collapsed ? TAB_BAR_COLLAPSED_WIDTH : (dragWidth ?? width),
      };
    },
    [collapsed, dragWidth, width],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const raw = start.startWidth + (e.clientX - start.startX);
      dragRawWidthRef.current = raw;
      // 変更理由: 縮小中の表示は48pxを下限にし、敷居判定は丸め前の実値で行う。
      const next = collapsed
        ? Math.max(TAB_BAR_COLLAPSED_WIDTH, Math.round(raw))
        : clampTabBarWidth(raw);
      dragWidthRef.current = next;
      setDragWidth(next);
    },
    [collapsed],
  );

  const handleResizePointerUp = useCallback(() => {
    resizeStartRef.current = null;
    const finalWidth = dragWidthRef.current;
    const rawWidth = dragRawWidthRef.current;
    dragWidthRef.current = null;
    dragRawWidthRef.current = null;
    setDragWidth(null);
    // 変更理由: 確定した幅だけを保存し、ドラッグ中の連続書き込みを避ける。
    // 縮小中に最小幅まで広げたら展開へ移し、敷居に届かなければ縮小のまま戻す。
    if (finalWidth == null) {
      return;
    }
    if (collapsed) {
      if ((rawWidth ?? finalWidth) >= TAB_BAR_WIDTH_MIN) {
        onCommitWidth(finalWidth, true);
      }
      return;
    }
    onCommitWidth(finalWidth, false);
  }, [collapsed, onCommitWidth]);

  const handleResizePointerCancel = useCallback(() => {
    // 変更理由: 中断時は操作中の幅を破棄し、保存済みの幅へ戻す。
    resizeStartRef.current = null;
    dragWidthRef.current = null;
    setDragWidth(null);
  }, []);

  return {
    dragWidth,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
    handleResizePointerCancel,
  };
}
