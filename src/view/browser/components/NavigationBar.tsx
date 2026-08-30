import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Command,
  Filter,
  History,
  Menu,
  Pause,
  PenLine,
  RotateCw,
  Settings,
  Star,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { container } from "src/service-container/index";
import { commandPalette } from "src/view/browser/commands/command-palette-store";
import { Omnibar } from "src/view/browser/components/Omnibar";
import { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useOmnibar } from "src/view/browser/hooks/use-omnibar";
import { usePageBookmark } from "src/view/browser/hooks/use-page-bookmark";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useUrlBarVisibility } from "src/view/browser/hooks/use-url-bar-visibility";
import { canGoBack, canGoForward, getCurrentPage, getDisplayUrl } from "src/view/browser/types";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import {
  getAutoRefreshPageKey,
  isAutoRefreshEnabledForPage,
} from "src/view/browser/utils/auto-refresh-pages";
import {
  QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE,
  type QuickAccessFilterPageType,
} from "src/view/browser/utils/filter-toolbar-events";
import {
  getLegacyBookmarkService,
  getLegacyHistoryService,
  waitForLegacyBookmarkReady,
} from "src/view/browser/utils/legacy-app";
import {
  getBoardUrlFromThreadUrl,
  parseInternalBrowserPage,
} from "src/view/browser/utils/link-routing";
import {
  mergeOmnibarSources,
  type OmnibarBoardSource,
  type OmnibarBookmarkSource,
  type OmnibarHistorySource,
  type OmnibarSuggestion,
} from "src/view/browser/utils/omnibar";

interface MenuPosition {
  x: number;
  y: number;
}

interface LegacyReadStateLike {
  read?: unknown;
}

interface LegacyBookmarkLike {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
  readState?: LegacyReadStateLike | undefined;
}

interface LegacyHistoryLike {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
  viewedDate?: unknown;
  date?: unknown;
}

const OMNIBAR_HISTORY_FETCH_COUNT = 300;
const OMNIBAR_MAX_SUGGESTIONS = 8;

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeLegacyTimestamp(value: unknown): number {
  const normalized = Math.trunc(toFiniteNumber(value));
  return normalized > 0 ? normalized : 0;
}

function deriveBoardTitle(threadUrl: string): string {
  try {
    const parsed = new window.URL(threadUrl);
    // 変更理由: read.cgi 系のURL揺れを helper 側に集約し、表示名だけこの関数で整形する。
    const boardUrl = getBoardUrlFromThreadUrl(threadUrl);
    if (boardUrl !== threadUrl) {
      const boardParsed = new window.URL(boardUrl);
      if (/^\/[^/]+\/$/.test(boardParsed.pathname)) {
        return `${parsed.hostname}/${boardParsed.pathname.replace(/^\//, "").replace(/\/$/, "")}`;
      }
    }

    return parsed.hostname;
  } catch {
    return "";
  }
}

function deriveBoardTitleFromBoardUrl(boardUrl: string): string {
  try {
    const parsed = new URL(boardUrl);
    const pathPart = parsed.pathname.replace(/^\/|\/$/g, "");
    return pathPart ? `${parsed.hostname}/${pathPart}` : parsed.hostname;
  } catch {
    return "";
  }
}

async function readBookmarkSources(): Promise<OmnibarBookmarkSource[]> {
  await waitForLegacyBookmarkReady();

  const bookmarkService = getLegacyBookmarkService();
  const rawThreads = bookmarkService?.getAllThreads?.();
  const rawBoards = bookmarkService?.getAllBoards?.();

  const rawItems = bookmarkService?.getAll?.() ?? [
    ...(Array.isArray(rawThreads) ? (rawThreads as unknown[]) : []),
    ...(Array.isArray(rawBoards) ? (rawBoards as unknown[]) : []),
  ];
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map<OmnibarBookmarkSource | null>((rawItem) => {
      const item = rawItem as LegacyBookmarkLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      const parsed = parseInternalBrowserPage(url);
      const boardTitle = normalizeString(item.boardTitle);

      return {
        url,
        title: normalizeString(item.title, url),
        boardTitle:
          parsed?.type === "threadList"
            ? boardTitle || deriveBoardTitleFromBoardUrl(url)
            : boardTitle || deriveBoardTitle(url),
      };
    })
    .filter((item): item is OmnibarBookmarkSource => item !== null);
}

async function readHistorySources(): Promise<OmnibarHistorySource[]> {
  const historyService = getLegacyHistoryService();

  if (!historyService?.get) {
    return [];
  }

  const raw = await historyService.get(0, OMNIBAR_HISTORY_FETCH_COUNT);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map<OmnibarHistorySource | null>((value) => {
      const item = value as LegacyHistoryLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      return {
        url,
        title: normalizeString(item.title, url),
        boardTitle: normalizeString(item.boardTitle, deriveBoardTitle(url)),
        viewedDate: normalizeLegacyTimestamp(item.viewedDate ?? item.date),
      };
    })
    .filter((item): item is OmnibarHistorySource => item !== null);
}

async function readBBSMenuBoardSources(): Promise<OmnibarBoardSource[]> {
  try {
    const result = await container.bbsMenu.get(false);
    if (result.status !== "success" || !result.menu) {
      return [];
    }
    return result.menu.flatMap((menu) =>
      menu.categories.flatMap((category) =>
        category.boards.map((board) => ({
          url: board.url,
          name: board.name,
          // 変更理由: bbsmenu の板候補は board.name が既に正式な板名なので、
          // URL 派生ラベルを boardTitle に入れると遷移直後の再解決判定を誤らせる。
          boardTitle: normalizeString(board.name),
        })),
      ),
    );
  } catch {
    return [];
  }
}

// URLバーからの入力でページ種別を推定してナビゲートする
function navigateByUrl(url: string, dispatch: ReturnType<typeof useTabStore>["dispatch"]) {
  const trimmed = url.trim();
  if (!trimmed) return;

  const parsed = parseInternalBrowserPage(trimmed);
  if (!parsed) return;

  if (parsed.type === "thread") {
    const boardUrl = getBoardUrlFromThreadUrl(parsed.threadUrl);
    // 変更理由: URL欄から別板のスレッドを開いたとき、直前に開いていた板を
    // 戻る先として残すと別板へ戻ってしまう。対象スレッドの板を履歴に積んでから
    // 遷移することで、戻る操作が常に対象スレッドの板へ戻るようにする。
    dispatch({
      type: "NAVIGATE",
      page: {
        type: "threadList",
        title: boardUrl,
        boardUrl,
        boardTitle: boardUrl,
      },
    });
  }

  dispatch({
    type: "NAVIGATE",
    page: parsed,
  });
}

export const NavigationBar: React.FC = () => {
  const { state, activeTab, currentPage, dispatch, paneId } = useTabStore();
  const { isOpen: isPanelOpen, togglePanel } = useBottomPanel();
  const { setExpanded: setUrlBarExpanded } = useUrlBarVisibility(paneId);

  const back = canGoBack(activeTab);
  const forward = canGoForward(activeTab);
  const displayUrl = getDisplayUrl(currentPage);
  const {
    bookmarkTarget,
    isBookmarked,
    isBookmarkPending,
    toggleBookmark: handleToggleBookmark,
  } = usePageBookmark(currentPage);

  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [backMenuPosition, setBackMenuPosition] = useState<MenuPosition | null>(null);
  const [refreshMenuPosition, setRefreshMenuPosition] = useState<MenuPosition | null>(null);
  const [forwardMenuPosition, setForwardMenuPosition] = useState<MenuPosition | null>(null);
  // URL入力は必要なときだけ展開し、タブと本文に使える高さを初期状態で確保する。
  const [isUrlExpanded, setIsUrlExpanded] = useState(false);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 変更理由: グローバルなトーストはペイン内のURLバーと別階層にあるため、
    // 展開中のペインを共有してURLバーの有無に応じた位置へ表示する。
    setUrlBarExpanded(isUrlExpanded);
    return () => {
      setUrlBarExpanded(false);
    };
  }, [isUrlExpanded, setUrlBarExpanded]);

  const currentAutoRefreshPageKey = getAutoRefreshPageKey(currentPage);
  const isCurrentPageAutoRefreshEnabled = isAutoRefreshEnabledForPage(activeTab, currentPage);

  const loadOmnibarEntries = useCallback(async () => {
    const [historyItems, bookmarkItems, boardItems] = await Promise.all([
      readHistorySources(),
      readBookmarkSources(),
      readBBSMenuBoardSources(),
    ]);

    // 変更理由: URLバー候補は履歴・お気に入り・bbsmenu板を統合し、
    // 利用者の直近行動と明示的なお気に入りおよび板一覧を1ストロークで辿れるようにする。
    return mergeOmnibarSources(bookmarkItems, historyItems, boardItems);
  }, []);

  const openSuggestion = useCallback(
    (suggestion: OmnibarSuggestion) => {
      const parsed = parseInternalBrowserPage(suggestion.url);
      if (!parsed) {
        return;
      }

      dispatch({
        type: "NAVIGATE",
        page: {
          ...parsed,
          title: suggestion.title,
          ...(parsed.type === "threadList"
            ? { boardTitle: suggestion.boardTitle || suggestion.title }
            : {}),
        },
      });

      urlInputRef.current?.blur();
    },
    [dispatch],
  );

  const {
    inputValue,
    isOpen: isOmnibarOpen,
    isLoading: isOmnibarLoading,
    suggestions: omnibarSuggestions,
    shouldShowNoMatch,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    handleInputChange,
    handleKeyDown,
    handleFocus,
    handleBlur,
    handleSelectSuggestion,
  } = useOmnibar({
    displayUrl,
    maxSuggestions: OMNIBAR_MAX_SUGGESTIONS,
    loadEntries: loadOmnibarEntries,
    onSelectSuggestion: openSuggestion,
    onSubmitInput: (url) => {
      navigateByUrl(url, dispatch);
    },
  });

  const handleRefresh = useCallback(() => {
    setRefreshMenuPosition(null);
    dispatch({ type: "RELOAD" });
  }, [dispatch]);

  const openQuickAccessPage = useCallback(
    (page: {
      type: "bookmarkList" | "historyList" | "writeHistoryList" | "logList";
      title: string;
    }) => {
      dispatch({ type: "NAVIGATE", page });
    },
    [dispatch],
  );

  const openQuickAccessPageInNewTab = useCallback(
    (page: {
      type: "bookmarkList" | "historyList" | "writeHistoryList" | "logList";
      title: string;
    }) => {
      dispatch({ type: "OPEN_IN_NEW_TAB_FORCE", page });
    },
    [dispatch],
  );

  const handleRefreshContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (currentPage.type !== "thread" && currentPage.type !== "threadList") {
        return;
      }

      e.preventDefault();
      setMenuPosition(null);
      setBackMenuPosition(null);
      setForwardMenuPosition(null);
      setRefreshMenuPosition((prev) => (prev ? null : { x: e.clientX, y: e.clientY }));
    },
    [currentPage.type],
  );

  const openSettingsTab = useCallback(() => {
    // 設定タブを毎回増やすより既存タブを再利用した方が往復しやすいため、まず開いている設定を探す。
    const existingSettingsTab = state.tabs.find((tab) => getCurrentPage(tab).type === "settings");

    if (existingSettingsTab) {
      dispatch({ type: "SELECT_TAB", tabId: existingSettingsTab.id });
      return;
    }

    dispatch({ type: "ADD_TAB" });
    dispatch({
      type: "NAVIGATE",
      page: { type: "settings", title: "設定" },
    });
  }, [dispatch, state.tabs]);

  const handleMenuClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setBackMenuPosition(null);
    setForwardMenuPosition(null);
    setRefreshMenuPosition(null);
    setMenuPosition((prev) => {
      if (prev) {
        return null;
      }
      return {
        x: Math.max(8, rect.right - 220),
        y: rect.bottom + 4,
      };
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  const closeBackMenu = useCallback(() => {
    setBackMenuPosition(null);
  }, []);

  const closeForwardMenu = useCallback(() => {
    setForwardMenuPosition(null);
  }, []);

  const closeRefreshMenu = useCallback(() => {
    setRefreshMenuPosition(null);
  }, []);

  const handleMenuRefresh = useCallback(() => {
    handleRefresh();
    closeMenu();
  }, [closeMenu, handleRefresh]);

  const handleMenuBookmark = useCallback(() => {
    handleToggleBookmark();
    closeMenu();
  }, [closeMenu, handleToggleBookmark]);

  const handleBackContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!back) return;
      setMenuPosition(null);
      setRefreshMenuPosition(null);
      setForwardMenuPosition(null);
      setBackMenuPosition({ x: e.clientX, y: e.clientY });
    },
    [back],
  );

  const handleForwardContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!forward) return;
      setMenuPosition(null);
      setRefreshMenuPosition(null);
      setBackMenuPosition(null);
      setForwardMenuPosition({ x: e.clientX, y: e.clientY });
    },
    [forward],
  );

  const toggleFilterFromMenu = useCallback(() => {
    // フィルタUIはメニュー項目からのみ開くことで、
    // メニューボタン押下そのものをトリガーにしない。
    if (currentPage.type === "thread") {
      window.dispatchEvent(new window.CustomEvent("thread-filter-toolbar-toggle"));
      return;
    }

    if (
      currentPage.type === "boardList" ||
      currentPage.type === "threadList" ||
      currentPage.type === "bookmarkList" ||
      currentPage.type === "historyList" ||
      currentPage.type === "writeHistoryList" ||
      currentPage.type === "logList"
    ) {
      const eventName =
        QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE[
          currentPage.type as QuickAccessFilterPageType
        ];
      window.dispatchEvent(
        new window.CustomEvent(eventName, {
          detail: { tabId: activeTab.id },
        }),
      );
    }
  }, [activeTab.id, currentPage.type]);

  useEffect(() => {
    if (currentPage.type !== "thread") {
      setRefreshMenuPosition(null);
    }
  }, [currentPage.type]);

  // 履歴タイトルは板名とスレ名が連結されて長くなりやすいため、
  // 戻る/進むメニューでは省略せず全文を折り返して見せる。

  const backHistoryItems = useMemo(
    () =>
      activeTab.history
        .map((page, index) => ({ page, index }))
        .filter(({ index }) => index < activeTab.currentIndex)
        .sort((a, b) => b.index - a.index)
        .map(({ page, index }) => ({
          id: `back-${index}`,
          label: page.title,
          allowMultilineLabel: true,
          onSelect: () => dispatch({ type: "GO_TO_HISTORY_INDEX", index }),
          onAuxSelect: (button: number) => {
            if (button !== 1) return;
            dispatch({ type: "OPEN_IN_NEW_TAB", page, background: true });
          },
        })),
    [activeTab.currentIndex, activeTab.history, dispatch],
  );

  const forwardHistoryItems = useMemo(
    () =>
      activeTab.history
        .map((page, index) => ({ page, index }))
        .filter(({ index }) => index > activeTab.currentIndex)
        .sort((a, b) => a.index - b.index)
        .map(({ page, index }) => ({
          id: `forward-${index}`,
          label: page.title,
          allowMultilineLabel: true,
          onSelect: () => dispatch({ type: "GO_TO_HISTORY_INDEX", index }),
          onAuxSelect: (button: number) => {
            if (button !== 1) return;
            dispatch({ type: "OPEN_IN_NEW_TAB", page, background: true });
          },
        })),
    [activeTab.currentIndex, activeTab.history, dispatch],
  );

  const menuItems = useMemo(
    () => [
      {
        id: "open-command-palette",
        label: "コマンドパレット",
        icon: <Command size={14} />,
        onSelect: commandPalette.open,
      },
      ...(currentPage.type === "thread" ||
      currentPage.type === "boardList" ||
      currentPage.type === "threadList" ||
      currentPage.type === "bookmarkList" ||
      currentPage.type === "historyList" ||
      currentPage.type === "writeHistoryList" ||
      currentPage.type === "logList"
        ? [
            {
              id: "open-filter-toolbar",
              label: "フィルター",
              icon: <Filter size={14} />,
              onSelect: toggleFilterFromMenu,
            },
          ]
        : []),
      ...(currentPage.type === "thread"
        ? [
            {
              id: "open-write-panel",
              label: isPanelOpen ? "書き込みパネルを閉じる" : "書き込みパネル",
              icon: <PenLine size={14} />,
              onSelect: () => togglePanel("write"),
            },
          ]
        : []),
      {
        id: "quick-access-separator",
        separator: true,
      },
      {
        id: "open-bookmark-list",
        label: "ブックマークリスト",
        icon: <Bookmark size={14} />,
        onSelect: () =>
          openQuickAccessPage({
            type: "bookmarkList",
            title: "ブックマークリスト",
          }),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab({
            type: "bookmarkList",
            title: "ブックマークリスト",
          });
        },
      },
      {
        id: "open-history-list",
        label: "閲覧履歴",
        icon: <History size={14} />,
        onSelect: () =>
          openQuickAccessPage({
            type: "historyList",
            title: "閲覧履歴",
          }),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab({
            type: "historyList",
            title: "閲覧履歴",
          });
        },
      },
      {
        id: "open-write-history-list",
        label: "書き込み履歴",
        icon: <PenLine size={14} />,
        onSelect: () =>
          openQuickAccessPage({
            type: "writeHistoryList",
            title: "書き込み履歴",
          }),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab({
            type: "writeHistoryList",
            title: "書き込み履歴",
          });
        },
      },
      {
        id: "open-log-list",
        label: "ログ検索",
        icon: <Archive size={14} />,
        onSelect: () =>
          openQuickAccessPage({
            type: "logList",
            title: "ログ検索",
          }),
        onAuxSelect: (button: number) => {
          if (button !== 1) return;
          openQuickAccessPageInNewTab({
            type: "logList",
            title: "ログ検索",
          });
        },
      },
    ],
    [
      currentPage.type,
      openQuickAccessPage,
      openQuickAccessPageInNewTab,
      toggleFilterFromMenu,
      isPanelOpen,
      togglePanel,
    ],
  );

  const refreshMenuItems = useMemo(
    () =>
      currentAutoRefreshPageKey != null
        ? [
            {
              id: "toggle-page-auto-refresh",
              label: isCurrentPageAutoRefreshEnabled ? "自動更新を停止" : "自動更新を開始",
              icon: isCurrentPageAutoRefreshEnabled ? <Pause size={14} /> : <RotateCw size={14} />,
              onSelect: () => {
                dispatch({
                  type: "SET_AUTO_REFRESH_ENABLED",
                  enabled: !isCurrentPageAutoRefreshEnabled,
                  pageKey: currentAutoRefreshPageKey,
                });
              },
            },
            {
              id: "page-auto-refresh-note",
              label: "アクティブなタブでのみ動作",
              disabled: true,
            },
          ]
        : [],
    [currentAutoRefreshPageKey, dispatch, isCurrentPageAutoRefreshEnabled],
  );

  // Android版Chromeのように頻繁に使う操作をメニューの最上段へまとめ、本文の横幅を優先する。
  const navigationMenuHeader = (
    <div className="nav-bar__menu-actions" role="group" aria-label="ナビゲーション操作">
      <button
        ref={backButtonRef}
        type="button"
        className="nav-bar__menu-action"
        disabled={!back}
        onClick={() => {
          dispatch({ type: "GO_BACK" });
          closeMenu();
        }}
        onContextMenu={handleBackContextMenu}
        title="戻る"
        aria-label="戻る"
      >
        <ArrowLeft size={17} />
      </button>
      <button
        ref={forwardButtonRef}
        type="button"
        className="nav-bar__menu-action"
        disabled={!forward}
        onClick={() => {
          dispatch({ type: "GO_FORWARD" });
          closeMenu();
        }}
        onContextMenu={handleForwardContextMenu}
        title="進む"
        aria-label="進む"
      >
        <ArrowRight size={17} />
      </button>
      <button
        ref={refreshButtonRef}
        type="button"
        className="nav-bar__menu-action"
        disabled={
          currentPage.type !== "thread" &&
          currentPage.type !== "threadList" &&
          currentPage.type !== "historyList" &&
          currentPage.type !== "writeHistoryList" &&
          currentPage.type !== "logList"
        }
        onClick={handleMenuRefresh}
        onContextMenu={handleRefreshContextMenu}
        title="更新"
        aria-label="更新"
      >
        <RotateCw size={17} />
      </button>
      <button
        type="button"
        className={`nav-bar__menu-action${isBookmarked ? " nav-bar__menu-action--active" : ""}`}
        disabled={!bookmarkTarget || isBookmarkPending}
        onClick={handleMenuBookmark}
        title={isBookmarked ? "お気に入りから削除" : "お気に入りに追加"}
        aria-label={isBookmarked ? "お気に入りから削除" : "お気に入りに追加"}
        aria-pressed={isBookmarked}
      >
        <Star size={17} fill={isBookmarked ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        className="nav-bar__menu-action"
        onClick={openSettingsTab}
        title="設定を開く"
        aria-label="設定を開く"
      >
        <Settings size={17} />
      </button>
    </div>
  );

  return (
    <div className="nav-bar">
      <button
        type="button"
        className="nav-bar__url-toggle"
        onClick={() => setIsUrlExpanded((expanded) => !expanded)}
        aria-expanded={isUrlExpanded}
        title={isUrlExpanded ? "URLバーを折りたたむ" : "URLバーを表示"}
        aria-label={isUrlExpanded ? "URLバーを折りたたむ" : "URLバーを表示"}
      >
        {isUrlExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>

      {isUrlExpanded && (
        <div className="nav-bar__url-row">
          <Omnibar
            inputRef={urlInputRef}
            inputValue={inputValue}
            placeholder="URLを入力"
            isOpen={isOmnibarOpen}
            isLoading={isOmnibarLoading}
            suggestions={omnibarSuggestions}
            activeSuggestionIndex={activeSuggestionIndex}
            shouldShowNoMatch={shouldShowNoMatch}
            onInputChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onSuggestionHover={setActiveSuggestionIndex}
            onSuggestionSelect={handleSelectSuggestion}
            trailingAction={
              bookmarkTarget ? (
                <button
                  type="button"
                  className={`nav-bar__url-action-btn${
                    isBookmarked ? " nav-bar__url-action-btn--active" : ""
                  }`}
                  aria-label={
                    isBookmarked
                      ? "このページをブックマークから削除"
                      : "このページをブックマークに追加"
                  }
                  aria-pressed={isBookmarked}
                  title={
                    isBookmarked
                      ? "このページをブックマークから削除"
                      : "このページをブックマークに追加"
                  }
                  disabled={isBookmarkPending}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={handleToggleBookmark}
                >
                  <Star size={16} fill={isBookmarked ? "currentColor" : "none"} />
                </button>
              ) : null
            }
          />
        </div>
      )}

      <button
        ref={menuButtonRef}
        type="button"
        className="nav-bar__btn"
        title="メニュー"
        onClick={handleMenuClick}
        onContextMenu={(e) => {
          e.preventDefault();
          handleMenuClick(e);
        }}
      >
        <Menu size={18} />
      </button>

      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          items={menuItems}
          header={navigationMenuHeader}
          onClose={closeMenu}
          triggerRef={menuButtonRef}
        />
      )}

      {backMenuPosition && backHistoryItems.length > 0 && (
        <ContextMenu
          x={backMenuPosition.x}
          y={backMenuPosition.y}
          items={backHistoryItems}
          onClose={closeBackMenu}
          triggerRef={backButtonRef}
        />
      )}

      {forwardMenuPosition && forwardHistoryItems.length > 0 && (
        <ContextMenu
          x={forwardMenuPosition.x}
          y={forwardMenuPosition.y}
          items={forwardHistoryItems}
          onClose={closeForwardMenu}
          triggerRef={forwardButtonRef}
        />
      )}

      {refreshMenuPosition && refreshMenuItems.length > 0 && (
        <ContextMenu
          x={refreshMenuPosition.x}
          y={refreshMenuPosition.y}
          items={refreshMenuItems}
          onClose={closeRefreshMenu}
          triggerRef={refreshButtonRef}
        />
      )}
    </div>
  );
};
