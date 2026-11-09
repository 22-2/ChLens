import { type DragEndEvent } from "@dnd-kit/react";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import { readSortableMove } from "src/view/browser/components/sortable-tab";

interface UseTabDragTrackingOptions {
  tabListRef: RefObject<HTMLDivElement | null>;
  onMoveTab: (tabId: string, visibleIndex: number) => boolean;
  onDragTabOut?: (
    tabId: string,
    screenX: number,
    screenY: number,
    clientPoint: { x: number; y: number },
  ) => boolean;
  onDragTabPreview?: (
    tabId: string,
    screenX: number,
    screenY: number,
    clientPoint: { x: number; y: number },
  ) => void;
  onDragTabPreviewEnd?: () => void;
}

/**
 * タブのドラッグ中にポインタの画面座標を追い、窓の外で離したときの別窓への移動と、
 * 並べ替え直後の click による選択の抑止を扱う。
 */
export function useTabDragTracking({
  tabListRef,
  onMoveTab,
  onDragTabOut,
  onDragTabPreview,
  onDragTabPreviewEnd,
}: UseTabDragTrackingOptions) {
  // ドラッグ終了直後の click イベントによるタブ選択を抑止するためのフラグ。
  const wasDraggingRef = useRef(false);
  const lastDragScreenPointRef = useRef<{
    x: number;
    y: number;
    clientPoint: { x: number; y: number };
  } | null>(null);
  const stopDragTrackingRef = useRef<(() => void) | null>(null);
  const stopTrackingDragPointer = useCallback(() => {
    stopDragTrackingRef.current?.();
    stopDragTrackingRef.current = null;
    lastDragScreenPointRef.current = null;
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const lastPoint = lastDragScreenPointRef.current;
      stopTrackingDragPointer();
      onDragTabPreviewEnd?.();
      const sourceId = event.operation.source?.id;
      // 窓の外で離した場合だけ、窓をまたぐ移動を試す。
      if (!event.canceled && lastPoint && sourceId != null && onDragTabOut) {
        if (onDragTabOut(String(sourceId), lastPoint.x, lastPoint.y, lastPoint.clientPoint)) {
          wasDraggingRef.current = true;
          return;
        }
      }
      // 実際に位置が変わっていなければ、click 抑止も並べ替えも行わない。
      const move = readSortableMove(event);
      if (!move) return;
      if (!onMoveTab(move.id, move.toIndex)) return;
      // ドラッグ完了直後の click イベントによるタブ選択を1回だけ抑止する。
      wasDraggingRef.current = true;
    },
    [onDragTabOut, onDragTabPreviewEnd, onMoveTab, stopTrackingDragPointer],
  );

  // 変更理由: ドラッグ中のポインタが窓の外へ出ても、ボタンを押している間は元の窓の
  // documentへイベントが届く。その画面座標を覚えておき、離した位置の判定に使う。
  const handleDragStart = useCallback(
    (event: { operation: { source: { id: string | number } | null } }) => {
      lastDragScreenPointRef.current = null;
      const ownerDocument = tabListRef.current?.ownerDocument;
      if (!ownerDocument) return;
      const tabId = event.operation.source?.id;
      const track = (event: PointerEvent) => {
        const clientPoint = { x: event.clientX, y: event.clientY };
        lastDragScreenPointRef.current = { x: event.screenX, y: event.screenY, clientPoint };
        if (tabId != null)
          onDragTabPreview?.(String(tabId), event.screenX, event.screenY, clientPoint);
      };
      ownerDocument.addEventListener("pointermove", track, { capture: true });
      stopDragTrackingRef.current = () =>
        ownerDocument.removeEventListener("pointermove", track, { capture: true });
    },
    [onDragTabPreview, tabListRef],
  );

  useEffect(
    () => () => {
      stopTrackingDragPointer();
      onDragTabPreviewEnd?.();
    },
    [stopTrackingDragPointer, onDragTabPreviewEnd],
  );

  return { wasDraggingRef, handleDragStart, handleDragEnd };
}
