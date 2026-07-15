import { useCallback, useEffect, useState } from "react";
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
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const closeFilterToolbar = useCallback(() => {
    setIsFilterOpen(false);
  }, []);

  useEffect(() => {
    // 変更理由: 履歴フィルタを閉じた後に検索語だけ残ると、
    // 一覧が絞られたままなのに再編集できず「閉じられない」体験になるため、閉じる時点で検索も戻す。
    if (!isFilterOpen && searchQuery) {
      setSearchQuery("");
    }
  }, [isFilterOpen, searchQuery, setSearchQuery]);

  useEffect(() => {
    const eventName = QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE[pageType];
    const handleToggle = (event: Event) => {
      const detail = (event as CustomEvent<QuickAccessFilterToggleDetail>).detail;
      if (!isActive || detail?.tabId !== tabId) {
        return;
      }

      setIsFilterOpen((prev) => !prev);
    };

    window.addEventListener(eventName, handleToggle);

    return () => {
      window.removeEventListener(eventName, handleToggle);
    };
  }, [isActive, pageType, tabId]);

  return {
    isFilterOpen,
    closeFilterToolbar,
  };
}
