import { useCallback, useEffect, useState } from "react";

const TOP_BAR_EVENT_BY_MODE = {
  search: "thread-search-toggle",
  filter: "thread-filter-toolbar-toggle",
} as const;

export type TopBarMode = "none" | "search" | "filter";

interface UseThreadTopBarParams {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

interface UseThreadTopBarResult {
  activeTopBar: TopBarMode;
  closeTopBar: () => void;
  isFilterToolbarVisible: boolean;
  isSearchBarVisible: boolean;
}

export function useThreadTopBar({
  searchQuery,
  setSearchQuery,
}: UseThreadTopBarParams): UseThreadTopBarResult {
  const [activeTopBar, setActiveTopBar] = useState<TopBarMode>("none");

  const closeTopBar = useCallback(() => {
    setActiveTopBar("none");
  }, []);

  const toggleTopBar = useCallback((panel: Exclude<TopBarMode, "none">) => {
    // 検索とフィルタを同時に開くとUI責務が競合するため、
    // 専用hook側で単一モードのトグル規則を閉じ込めて再利用しやすくする。
    setActiveTopBar((prev) => (prev === panel ? "none" : panel));
  }, []);

  useEffect(() => {
    // 検索バーを閉じたあと古いクエリが残ると次回表示時に意図せず絞り込まれるため、
    // 検索モードを抜けた時点で検索語をクリアする。
    if (activeTopBar !== "search" && searchQuery) {
      setSearchQuery("");
    }
  }, [activeTopBar, searchQuery, setSearchQuery]);

  useEffect(() => {
    const cleanups = Object.entries(TOP_BAR_EVENT_BY_MODE).map(
      ([mode, eventName]) => {
        const handleToggleTopBar = () => {
          toggleTopBar(mode as Exclude<TopBarMode, "none">);
        };
        window.addEventListener(eventName, handleToggleTopBar);
        return () => window.removeEventListener(eventName, handleToggleTopBar);
      },
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [toggleTopBar]);

  return {
    activeTopBar,
    closeTopBar,
    isFilterToolbarVisible: activeTopBar === "filter",
    isSearchBarVisible: activeTopBar === "search",
  };
}
