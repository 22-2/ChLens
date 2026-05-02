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
  searchFocusKey: number;
}

export function useThreadTopBar({
  searchQuery,
  setSearchQuery,
}: UseThreadTopBarParams): UseThreadTopBarResult {
  const [activeTopBar, setActiveTopBar] = useState<TopBarMode>("none");
  const [searchFocusKey, setSearchFocusKey] = useState(0);

  const closeTopBar = useCallback(() => {
    setActiveTopBar("none");
  }, []);

  const toggleFilterToolbar = useCallback(() => {
    // 検索欄を同じツールバーへ統合したので、フィルタ操作は表示状態だけを反転させる。
    setActiveTopBar((prev) => (prev === "filter" ? "none" : "filter"));
  }, []);

  const openFilterToolbarForSearch = useCallback(() => {
    // 検索は独立バーではなく同じツールバー内で開き、
    // スクロール中でも即入力欄へ移れるよう focus 用キーを更新する。
    setActiveTopBar("filter");
    setSearchFocusKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    // ツールバーを閉じたあと検索語が残ると、入力欄が見えないのに絞り込みだけ続くため、
    // 非表示へ戻した時点で検索語をクリアする。
    if (activeTopBar === "none" && searchQuery) {
      setSearchQuery("");
    }
  }, [activeTopBar, searchQuery, setSearchQuery]);

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
      window.removeEventListener(
        TOP_BAR_EVENT_BY_MODE.search,
        handleSearchToggle,
      );
      window.removeEventListener(
        TOP_BAR_EVENT_BY_MODE.filter,
        handleFilterToggle,
      );
    };
  }, [openFilterToolbarForSearch, toggleFilterToolbar]);

  return {
    activeTopBar,
    closeTopBar,
    searchFocusKey,
  };
}
