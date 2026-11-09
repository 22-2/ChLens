import { useEffect, useRef, useState } from "react";

/**
 * 追加されたタブを一定時間だけ強調する対象として返し、追加位置が見えるようにスクロールする。
 */
export function useNewTabHighlight(
  items: readonly { tab: { id: string } }[],
  scrollTabIntoView: (tabId: string) => void,
): Set<string> {
  const [highlightedTabIds, setHighlightedTabIds] = useState<Set<string>>(new Set());
  const prevTabIdsRef = useRef<Set<string>>(new Set(items.map((item) => item.tab.id)));

  useEffect(() => {
    const prev = prevTabIdsRef.current;
    const current = new Set(items.map((item) => item.tab.id));
    const newIds = items.map((item) => item.tab.id).filter((tabId) => !prev.has(tabId));

    if (newIds.length > 0) {
      // 変更理由: バックグラウンド追加では selectedTabId が変わらないため、
      // 新規タブ自体を基準にスクロールしないと追加位置を利用者が確認できない。
      scrollTabIntoView(newIds[newIds.length - 1]);
      setHighlightedTabIds((prevIds) => {
        const next = new Set(prevIds);
        for (const tabId of newIds) {
          next.add(tabId);
        }
        return next;
      });

      const timerId = window.setTimeout(() => {
        setHighlightedTabIds((prevIds) => {
          const next = new Set(prevIds);
          for (const tabId of newIds) {
            next.delete(tabId);
          }
          return next;
        });
      }, 1500);

      return () => window.clearTimeout(timerId);
    }

    prevTabIdsRef.current = current;
    return;
  }, [scrollTabIntoView, items]);

  useEffect(() => {
    prevTabIdsRef.current = new Set(items.map((item) => item.tab.id));
  }, [items]);

  return highlightedTabIds;
}
