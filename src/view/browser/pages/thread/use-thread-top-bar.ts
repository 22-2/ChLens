import { useCallback, useEffect, useState } from "react";

const TOP_BAR_EVENT_BY_MODE = {
  search: "thread-search-toggle",
  filter: "thread-filter-toolbar-toggle",
} as const;

export type TopBarMode = "none" | "filter";

interface UseThreadTopBarParams {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

interface UseThreadTopBarResult {
  activeTopBar: TopBarMode;
  closeTopBar: () => void;
  closeTopBarPreservingFilter: () => void;
  openFilterToolbar: () => void;
  searchFocusKey: number;
}

export function useThreadTopBar({
  searchQuery,
  setSearchQuery,
}: UseThreadTopBarParams): UseThreadTopBarResult {
  const [activeTopBar, setActiveTopBar] = useState<TopBarMode>("none");
  const [searchFocusKey, setSearchFocusKey] = useState(0);

  const closeTopBar = useCallback(() => {
    if (searchQuery) {
      setSearchQuery("");
    }
    setActiveTopBar("none");
  }, [searchQuery, setSearchQuery]);

  const closeTopBarPreservingFilter = useCallback(() => {
    // 変更理由: ホイールで閉じる操作はツールバーの表示だけを戻し、
    // 入力済みの検索語による絞り込みは維持する。
    setActiveTopBar("none");
  }, []);

  const toggleFilterToolbar = useCallback(() => {
    // 検索欄を同じツールバーへ統合したので、フィルタ操作は表示状態だけを反転させる。
    if (activeTopBar === "filter") {
      closeTopBar();
    } else {
      setActiveTopBar("filter");
    }
  }, [activeTopBar, closeTopBar]);

  const openFilterToolbar = useCallback(() => {
    // 変更理由: ホイールなどの「開くだけでよい」導線では toggle だと閉じ戻り得るため、
    // 明示的な open API を用意して入力欄の表示を安定させる。
    setActiveTopBar("filter");
  }, []);

  const openFilterToolbarForSearch = useCallback(() => {
    // 検索は独立バーではなく同じツールバー内で開き、
    // スクロール中でも即入力欄へ移れるよう focus 用キーを更新する。
    setActiveTopBar("filter");
    setSearchFocusKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const handleSearchToggle = () => {
      openFilterToolbarForSearch();
    };
    const handleFilterToggle = () => {
      toggleFilterToolbar();
    };

    window.addEventListener(TOP_BAR_EVENT_BY_MODE.search, handleSearchToggle);
    window.addEventListener(TOP_BAR_EVENT_BY_MODE.filter, handleFilterToggle);

    return () => {
      window.removeEventListener(TOP_BAR_EVENT_BY_MODE.search, handleSearchToggle);
      window.removeEventListener(TOP_BAR_EVENT_BY_MODE.filter, handleFilterToggle);
    };
  }, [openFilterToolbarForSearch, toggleFilterToolbar]);

  return {
    activeTopBar,
    closeTopBar,
    closeTopBarPreservingFilter,
    openFilterToolbar,
    searchFocusKey,
  };
}
