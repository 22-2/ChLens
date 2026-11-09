import { type RefObject, useCallback, useEffect, useState } from "react";

export interface TabListScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  canScrollTop: boolean;
  canScrollBottom: boolean;
}

interface UseTabListScrollOptions {
  tabListRef: RefObject<HTMLDivElement | null>;
  selectedTabId: string;
  /** タブの増減や並び替えのたびに、スクロール状態を測り直すための依存値。 */
  items: readonly unknown[];
}

/**
 * タブ一覧の左右・上下にスクロールできる余地を測り、選択タブが見切れたときだけ表示範囲へ寄せる。
 */
export function useTabListScroll({ tabListRef, selectedTabId, items }: UseTabListScrollOptions) {
  const [tabListScrollState, setTabListScrollState] = useState<TabListScrollState>({
    canScrollLeft: false,
    canScrollRight: false,
    canScrollTop: false,
    canScrollBottom: false,
  });

  const updateTabListScrollState = useCallback(() => {
    const tabList = tabListRef.current;
    if (!tabList) return;

    const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
    const maxScrollTop = Math.max(0, tabList.scrollHeight - tabList.clientHeight);
    const nextState = {
      canScrollLeft: tabList.scrollLeft > 1,
      canScrollRight: tabList.scrollLeft < maxScrollLeft - 1,
      canScrollTop: tabList.scrollTop > 1,
      canScrollBottom: tabList.scrollTop < maxScrollTop - 1,
    };

    setTabListScrollState((previous) =>
      previous.canScrollLeft === nextState.canScrollLeft &&
      previous.canScrollRight === nextState.canScrollRight &&
      previous.canScrollTop === nextState.canScrollTop &&
      previous.canScrollBottom === nextState.canScrollBottom
        ? previous
        : nextState,
    );
  }, [tabListRef]);

  const scrollTabIntoView = useCallback(
    (tabId: string) => {
      const tabElement = [
        ...(tabListRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? []),
      ].find((tab) => tab.dataset.tabId === tabId);
      tabElement?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    },
    [tabListRef],
  );

  const scrollSelectedTabIntoView = useCallback(
    (tabId: string) => {
      const tabList = tabListRef.current;
      const tabElement = [...(tabList?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [])].find(
        (tab) => tab.dataset.tabId === tabId,
      );
      if (!tabList || !tabElement) return;

      const tabListRect = tabList.getBoundingClientRect();
      const tabRect = tabElement.getBoundingClientRect();
      // 変更理由: 垂直モードでは上下の見切れも判定する。水平モードでは縦方向に
      // はみ出さないため、両軸の判定を共通化しても既存の挙動は変わらない。
      const isOutsideViewport =
        tabRect.left < tabListRect.left ||
        tabRect.right > tabListRect.right ||
        tabRect.top < tabListRect.top ||
        tabRect.bottom > tabListRect.bottom;
      if (isOutsideViewport) {
        // 変更理由: 常に scrollIntoView するとタブ切り替えのたびに既存の横位置へ干渉するため、
        // 選択タブが見切れている場合だけ、最小限のスクロールを発生させる。
        tabElement.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    },
    [tabListRef],
  );

  const handleTabListResize = useCallback(() => {
    updateTabListScrollState();
    // 変更理由: 表示領域やタブ幅の変化で選択タブの矩形が見切れるため、
    // 選択IDの変更時だけでなく、リサイズ時にも既存の境界判定を再利用する。
    // 見切れている場合だけスクロールするので、手動で決めた横位置を不要に奪わない。
    scrollSelectedTabIntoView(selectedTabId);
  }, [scrollSelectedTabIntoView, selectedTabId, updateTabListScrollState]);

  useEffect(() => {
    const tabList = tabListRef.current;
    if (!tabList) return;

    // スクロール位置の変化だけでなく、ウィンドウ幅とタブ幅の変化も表示へ反映する。
    tabList.addEventListener("scroll", updateTabListScrollState, { passive: true });
    window.addEventListener("resize", handleTabListResize);

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleTabListResize);
      resizeObserver.observe(tabList);
    }

    updateTabListScrollState();

    return () => {
      tabList.removeEventListener("scroll", updateTabListScrollState);
      window.removeEventListener("resize", handleTabListResize);
      resizeObserver?.disconnect();
    };
  }, [handleTabListResize, tabListRef, updateTabListScrollState, items]);

  const isTabListScrollable = tabListScrollState.canScrollLeft || tabListScrollState.canScrollRight;

  useEffect(() => {
    scrollSelectedTabIntoView(selectedTabId);
  }, [scrollSelectedTabIntoView, selectedTabId]);

  return { tabListScrollState, isTabListScrollable, scrollTabIntoView };
}
