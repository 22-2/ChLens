import type { DragEndEvent } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";

// Material Design の Fast-out, Slow-in カーブで Chrome 風の吸い付く感を再現する。
// タブバーとサイドパネルのタブでドラッグの挙動を揃えるため、ここで一元管理する。
const SORTABLE_TRANSITION = {
  duration: 200,
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
};

interface UseSortableTabOptions {
  id: string;
  index: number;
  /** 異なるグループの間は並べ替えが越えない（ピン留めと通常の境界など）。 */
  group: string;
}

export function useSortableTab({ id, index, group }: UseSortableTabOptions) {
  return useSortable({ id, index, group, transition: SORTABLE_TRANSITION });
}

interface SortableTabMove {
  id: string;
  toIndex: number;
}

/**
 * DragDropProvider の onDragEnd イベントから、実際に位置が変わった並べ替えだけを取り出す。
 * キャンセルされた場合や位置が変わっていない場合は null を返す。
 */
export function readSortableMove(event: DragEndEvent): SortableTabMove | null {
  // event.canceled はドラッグがキャンセル（Esc キーなど）された場合に true になる。
  if (event.canceled) return null;
  const { operation } = event;
  if (!isSortableOperation(operation)) return null;
  const { source } = operation;
  if (!source) return null;
  // 変更理由: OptimisticSortingPlugin がドラッグ中に確定させたグループ内の最終位置を
  // source.sortable.index として受け取り、それをそのまま並べ替えの真実にする。
  // ドロップ先タブIDから逆算すると投影インデックスとズレるため使わない。
  const toIndex = source.index;
  const initialIndex = source.sortable?.initialIndex;
  if (typeof toIndex !== "number") return null;
  if (typeof initialIndex === "number" && toIndex === initialIndex) return null;
  return { id: String(source.id), toIndex };
}
