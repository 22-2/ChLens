import { useCallback, useEffect, useRef, useState } from "react";
import {
  QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE,
  type QuickAccessFilterPageType,
  type QuickAccessFilterToggleDetail,
} from "src/view/browser/utils/filter-toolbar-events";

interface UseQuickAccessFilterToolbarParams {
  pageType: QuickAccessFilterPageType;
  tabId: string;
  isActive: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

interface UseQuickAccessFilterToolbarResult {
  isFilterOpen: boolean;
  closeFilterToolbar: () => void;
}

export function useQuickAccessFilterToolbar({
  pageType,
  tabId,
  isActive,
  searchQuery,
  setSearchQuery,
}: UseQuickAccessFilterToolbarParams): UseQuickAccessFilterToolbarResult {
  const [isFilterOpen, setIsFilterOpen] = useState(() => searchQuery.trim().length > 0);
  const openedByWheelRef = useRef(false);

  const closeFilterToolbar = useCallback(() => {
    if (searchQuery) {
      setSearchQuery("");
    }
    setIsFilterOpen(false);
  }, [searchQuery, setSearchQuery]);

  useEffect(() => {
    if (!isFilterOpen) {
      openedByWheelRef.current = false;
    }
  }, [isFilterOpen]);

  useEffect(() => {
    const eventName = QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE[pageType];
    const handleToggle = (event: Event) => {
      const detail = (event as CustomEvent<QuickAccessFilterToggleDetail>).detail;
      if (!isActive || detail?.tabId !== tabId) {
        return;
      }

      if (isFilterOpen) {
        closeFilterToolbar();
      } else {
        setIsFilterOpen(true);
      }
    };

    window.addEventListener(eventName, handleToggle);

    return () => {
      window.removeEventListener(eventName, handleToggle);
    };
  }, [closeFilterToolbar, isActive, isFilterOpen, pageType, tabId]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !(event.target instanceof Element)) {
        return;
      }

      // 変更理由: 一覧の端で更新ジェスチャーが先にイベントを消費した場合、
      // 同じwheelイベントでフィルタまで開くと更新と表示切替が同時に発生するため、
      // 先行するハンドラーのpreventDefaultを更新操作の優先通知として扱う。
      if (event.defaultPrevented) {
        return;
      }

      // メニューやポップアップ上のホイール操作はフィルタ開閉に反映しない。
      if (
        event.target.closest("[data-popup='true']") ||
        event.target.closest(".mini-window") ||
        event.target.closest(".media-viewer") ||
        event.target.closest(".bookmark-root-dialog")
      ) {
        return;
      }

      const tabPanel = event.target.closest<HTMLElement>(".content-area__tab-panel");
      if (!tabPanel || tabPanel.dataset.tabPanelId !== tabId) {
        return;
      }

      const table = tabPanel.querySelector(".simple-data-table");
      if (!table) {
        return;
      }

      const scrollContainer =
        table.closest<HTMLElement>(".simple-data-table__scroller") ?? tabPanel;

      if (event.deltaY > 0 && isFilterOpen && openedByWheelRef.current) {
        // 変更理由: ホイールで開いた直後の逆方向操作はフィルタを戻す意図として消費し、
        // 同じ一操作で一覧までスクロールして位置が飛ぶのを防ぐ。
        event.preventDefault();
        openedByWheelRef.current = false;
        // 変更理由: ホイール操作はツールバー表示だけを戻す操作として扱い、
        // 適用中の検索語と絞り込み結果はそのまま維持する。
        setIsFilterOpen(false);
        return;
      }

      if (event.deltaY >= 0 || isFilterOpen) {
        return;
      }

      if (scrollContainer.scrollTop > 1) {
        return;
      }

      // 変更理由: 通常テーブルと仮想テーブルでスクロール要素が異なるため、
      // ホイール発生元のテーブルから実際のスクロール要素をたどって上端判定を統一する。
      openedByWheelRef.current = true;
      setIsFilterOpen(true);
    };

    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [isActive, isFilterOpen, tabId]);

  return {
    isFilterOpen,
    closeFilterToolbar,
  };
}
