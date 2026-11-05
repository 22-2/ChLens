import { type DragEndEvent, PointerSensor } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";

// Material Design の Fast-out, Slow-in カーブで Chrome 風の吸い付く感を再現する。
// タブバーとサイドパネルのタブでドラッグの挙動を揃えるため、ここで一元管理する。
const SORTABLE_TRANSITION = {
  duration: 200,
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
};

/** 別窓の文書にもポインタの終了と移動を届ける。 */
export class WindowPointerSensor extends PointerSensor {
  private unbindWindowEvents?: () => void;

  protected override handlePointerDown(
    event: PointerEvent,
    source: Parameters<PointerSensor["bind"]>[0],
    options: Parameters<PointerSensor["bind"]>[1],
  ): void {
    super.handlePointerDown(event, source, options);
    const ownerDocument = source.element?.ownerDocument;
    // 標準センサーは本窓とその iframe だけを監視し、Portal 先の別窓を含めない。
    if (!ownerDocument || ownerDocument === document || !this.controller) return;
    const move = (next: PointerEvent) => this.handlePointerMove(next, source);
    const up = (next: PointerEvent) => {
      const { status } = this.manager.dragOperation;
      if (!status.idle) {
        next.preventDefault();
        next.stopPropagation();
        this.manager.actions.stop({ event: next, canceled: !status.initialized });
      }
      this.cleanup();
    };
    const cancel = (next: Event) => this.handleCancel(next);
    ownerDocument.addEventListener("pointermove", move);
    ownerDocument.addEventListener("pointerup", up, true);
    ownerDocument.addEventListener("pointercancel", cancel);
    this.unbindWindowEvents = () => {
      ownerDocument.removeEventListener("pointermove", move);
      ownerDocument.removeEventListener("pointerup", up, true);
      ownerDocument.removeEventListener("pointercancel", cancel);
    };
  }

  protected override cleanup(): void {
    this.unbindWindowEvents?.();
    this.unbindWindowEvents = undefined;
    super.cleanup();
  }
}

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
