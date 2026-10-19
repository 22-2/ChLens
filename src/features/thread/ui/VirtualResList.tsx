import { type ReactNode, type RefObject, useLayoutEffect, useRef } from "react";
import { useVirtualList } from "src/view/browser/hooks/use-virtual-list";
import type { VirtualKey } from "src/view/browser/utils/virtual-list/layout";
import type { VirtualListController } from "src/view/browser/utils/virtual-list/virtual-list-controller";

interface VirtualResListProps {
  controller: VirtualListController;
  scrollContainerRef: RefObject<HTMLElement | null>;
  renderItem: (key: VirtualKey) => ReactNode;
  /** ジャンプ先として強調するレス。描画された時点で一度だけ強調する。 */
  highlightKey: VirtualKey | null;
  onHighlightApplied: (key: VirtualKey) => void;
}

const HIGHLIGHT_CLASS = "res--highlighted";

/**
 * 表示範囲にかかるレスだけを描画するレス一覧。
 *
 * 全体の高さを持つ箱の中に、各レスを controller が決めた位置へ絶対配置する。
 * 位置は DOM の並びではなく controller の累積和で決まるため、範囲外のレスを外しても
 * 見えているレスの位置は動かない。
 */
export function VirtualResList({
  controller,
  scrollContainerRef,
  renderItem,
  highlightKey,
  onHighlightApplied,
}: VirtualResListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const { snapshot, measureItem } = useVirtualList({
    controller,
    scrollContainerRef,
    listRef,
    // このリストは表示中のタブでだけマウントされるため、常に有効でよい。
    enabled: true,
  });

  useLayoutEffect(() => {
    if (highlightKey === null) return;
    const item = listRef.current?.querySelector(`[data-virtual-key="${String(highlightKey)}"]`);
    // 飛び先がまだ描画範囲に入っていなければ、次の描画で再び試す。
    const target = item?.querySelector<HTMLElement>("[data-res-num]");
    if (!target) return;
    target.classList.add(HIGHLIGHT_CLASS);
    target.addEventListener("animationend", () => target.classList.remove(HIGHLIGHT_CLASS), {
      once: true,
    });
    onHighlightApplied(highlightKey);
  }, [highlightKey, onHighlightApplied, snapshot]);

  return (
    <div ref={listRef} className="virtual-res-list" style={{ height: snapshot.totalSize }}>
      {snapshot.items.map((item) => (
        <div
          key={String(item.key)}
          ref={measureItem(item.key)}
          className="virtual-res-list__item"
          style={{ transform: `translateY(${item.top}px)` }}
        >
          {renderItem(item.key)}
        </div>
      ))}
    </div>
  );
}
