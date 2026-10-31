import { useCallback, useEffect } from "react";
import type { useThreadData } from "src/features/thread/browser/use-thread-data";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import { subscribeThreadResJump } from "src/view/browser/utils/thread-read-state";

type ThreadDataResult = ReturnType<typeof useThreadData>;

/** 初期表示のレス指定やレス移動で、保存済みの絞り込みを解除する。返り値はフィルタバーを閉じるときの解除関数。 */
export function useThreadFilterReset({
  tabId,
  page,
  setFilter,
  setSearchQuery,
}: {
  tabId: string;
  page: ThreadPageType;
  setFilter: ThreadDataResult["setFilter"];
  setSearchQuery: ThreadDataResult["setSearchQuery"];
}) {
  useEffect(() => {
    if (page.initialResNum == null) return;
    // URLで選んだレスが保存済みの絞り込みに隠れないよう、初期表示前に解除する。
    setFilter("all");
    setSearchQuery("");
  }, [page.threadUrl, page.initialResNum, setFilter, setSearchQuery]);
  useEffect(
    () =>
      subscribeThreadResJump((jump) => {
        if (
          !jump.clearFilter ||
          jump.threadUrl !== page.threadUrl ||
          (jump.targetTabId && jump.targetTabId !== tabId)
        )
          return;
        // 変更理由: Overlayから選んだレスが絞り込みでDOMから消えていると、
        // タブだけ移っても目的のレスを表示できないため、移動時に絞り込みを解除する。
        setFilter("all");
        setSearchQuery("");
      }),
    [page.threadUrl, setFilter, setSearchQuery, tabId],
  );
  const clearFilter = useCallback(() => {
    // 変更理由: フィルタバーを閉じた後に再表示したとき、前回の絞り込みだけが
    // 残っている状態を避け、本文と操作欄の状態を一致させる。
    setFilter("all");
  }, [setFilter]);
  return clearFilter;
}
