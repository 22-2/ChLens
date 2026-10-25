import type { ReactVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import type { VirtualKey } from "src/features/thread/browser/use-thread-virtual-list";

interface VirtualResListProps {
  virtualizer: ReactVirtualizer<HTMLElement, HTMLElement>;
  keys: readonly VirtualKey[];
  renderItem: (key: VirtualKey) => ReactNode;
  /** ジャンプ先として強調するレス。描画された時点で一度だけ強調する。 */
  highlightKey: VirtualKey | null;
  onHighlightApplied: (key: VirtualKey) => void;
}

const HIGHLIGHT_CLASS = "res--highlighted";

/**
 * 表示範囲にかかるレスだけを描画するレス一覧。
 *
 * 全体の高さを持つ箱の中に、TanStack Virtualが選んだレスを絶対配置する。
 * 位置はTanStack Virtualの計測値で決まるため、範囲外のレスを外しても
 * 見えているレスの位置は動かない。
 */
export function VirtualResList({
  virtualizer,
  keys,
  renderItem,
  highlightKey,
  onHighlightApplied,
}: VirtualResListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualItems = virtualizer.getVirtualItems();

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
  }, [highlightKey, onHighlightApplied, virtualItems]);

  return (
    <div ref={listRef} className="virtual-res-list" style={{ height: virtualizer.getTotalSize() }}>
      {virtualItems.map((item) => (
        <div
          key={String(item.key)}
          data-virtual-key={String(item.key)}
          data-index={item.index}
          ref={virtualizer.measureElement}
          className="virtual-res-list__item"
          style={{ transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}
        >
          {renderItem(keys[item.index]!)}
        </div>
      ))}
    </div>
  );
}
