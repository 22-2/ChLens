import { useCallback, useEffect, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import {
  THREAD_FILTER_TOOLBAR_TOGGLE_EVENT,
  type ThreadFilterToolbarToggleDetail,
} from "src/view/browser/utils/filter-toolbar-events";
import {
  setFilterToolbarOpen,
  setFilterToolbarPinned,
} from "src/view/browser/utils/filter-toolbar-open-state";

const TOP_BAR_EVENT_BY_MODE = {
  search: "thread-search-toggle",
  filter: THREAD_FILTER_TOOLBAR_TOGGLE_EVENT,
} as const;

export type TopBarMode = "none" | "filter";

interface UseThreadTopBarParams {
  tabId: string;
  isActive: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  clearFilter: () => void;
  hasActiveFilter?: boolean;
  /** 設定がONのとき、バーを常時表示し、閉じる操作とタイトルバーからの切り替えを受け付けない。 */
  pinnedOpen?: boolean;
}

interface UseThreadTopBarResult {
  activeTopBar: TopBarMode;
  closeTopBar: () => void;
  closeTopBarPreservingFilter: () => void;
  openFilterToolbar: () => void;
  searchFocusKey: number;
  /** 設定で開いた直後は、閲覧中のキー操作を奪わないよう入力欄へフォーカスしない。 */
  suppressInitialFocus: boolean;
}

export function useThreadTopBar({
  tabId,
  isActive,
  searchQuery,
  setSearchQuery,
  clearFilter,
  hasActiveFilter = false,
  pinnedOpen = false,
}: UseThreadTopBarParams): UseThreadTopBarResult {
  const { window: viewWindow } = useViewSurface();
  const [selectedTopBar, setActiveTopBarState] = useState<TopBarMode>(() =>
    searchQuery.trim() !== "" || hasActiveFilter || pinnedOpen ? "filter" : "none",
  );
  // 変更理由: 設定がONのときは状態に関係なく常に開いた表示にし、閉じる操作を効かせない。
  // 状態は保持したままなので、設定をOFFに戻したときは直前の表示状態へ戻る。
  const activeTopBar: TopBarMode = pinnedOpen ? "filter" : selectedTopBar;
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  // 検索語やフィルタが無く、設定で開いた直後に限りフォーカスを移さない。
  const [suppressInitialFocus, setSuppressInitialFocus] = useState(
    () => pinnedOpen && searchQuery.trim() === "" && !hasActiveFilter,
  );
  // 利用者の操作でバーの状態が変わったら、以降は通常どおり入力欄へフォーカスする。
  const setActiveTopBar = useCallback((mode: TopBarMode) => {
    setSuppressInitialFocus(false);
    setActiveTopBarState(mode);
  }, []);

  useEffect(() => {
    setFilterToolbarOpen(tabId, activeTopBar === "filter");
    return () => {
      setFilterToolbarOpen(tabId, false);
    };
  }, [activeTopBar, tabId]);

  useEffect(() => {
    // 常時表示のときは開閉ボタンを隠すため、NavigationBarへ状態を伝える。
    setFilterToolbarPinned(tabId, pinnedOpen);
    return () => {
      setFilterToolbarPinned(tabId, false);
    };
  }, [pinnedOpen, tabId]);

  const closeTopBar = useCallback(() => {
    if (pinnedOpen) {
      return;
    }
    if (searchQuery) {
      setSearchQuery("");
    }
    // 変更理由: 手動でフィルタバーを閉じた後に見えているレスと内部の絞り込み状態が
    // 食い違わないよう、検索語とフィルタ条件を同じクローズ操作で解除する。
    clearFilter();
    setActiveTopBar("none");
  }, [clearFilter, pinnedOpen, searchQuery, setSearchQuery]);

  const closeTopBarPreservingFilter = useCallback(() => {
    // 変更理由: ホイールで閉じる操作はツールバーの表示だけを戻し、
    // 入力済みの検索語による絞り込みは維持する。常時表示のときは閉じない。
    if (pinnedOpen) {
      return;
    }
    setActiveTopBar("none");
  }, [pinnedOpen]);

  const toggleFilterToolbar = useCallback(() => {
    // 検索欄を同じツールバーへ統合したので、フィルタ操作は表示状態だけを反転させる。
    // 変更理由: 常時表示のときはタイトルバーからの切り替えを無視する。
    if (pinnedOpen) {
      return;
    }
    if (activeTopBar === "filter") {
      closeTopBar();
    } else {
      setActiveTopBar("filter");
    }
  }, [activeTopBar, closeTopBar, pinnedOpen]);

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
    const handleFilterToggle = (event: Event) => {
      const detail = (event as CustomEvent<ThreadFilterToolbarToggleDetail>).detail;
      if (detail?.tabId != null && (!isActive || detail.tabId !== tabId)) {
        return;
      }
      toggleFilterToolbar();
    };

    viewWindow.addEventListener(TOP_BAR_EVENT_BY_MODE.search, handleSearchToggle);
    viewWindow.addEventListener(TOP_BAR_EVENT_BY_MODE.filter, handleFilterToggle);

    return () => {
      viewWindow.removeEventListener(TOP_BAR_EVENT_BY_MODE.search, handleSearchToggle);
      viewWindow.removeEventListener(TOP_BAR_EVENT_BY_MODE.filter, handleFilterToggle);
    };
  }, [isActive, openFilterToolbarForSearch, tabId, toggleFilterToolbar, viewWindow]);

  return {
    activeTopBar,
    closeTopBar,
    closeTopBarPreservingFilter,
    openFilterToolbar,
    searchFocusKey,
    suppressInitialFocus,
  };
}
