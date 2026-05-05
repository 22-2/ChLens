import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Filter,
  History,
  Menu,
  Pause,
  PenLine,
  RotateCw,
  Settings,
  Star,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { Omnibar } from "src/view/browser/components/Omnibar";
import { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useOmnibar } from "src/view/browser/hooks/use-omnibar";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import {
  canGoBack,
  canGoForward,
  getCurrentPage,
  getDisplayUrl,
  type Page,
} from "src/view/browser/types";
import {
  QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE,
  type QuickAccessFilterPageType,
} from "src/view/browser/utils/filter-toolbar-events";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";
import { container } from "src/service-container/index";
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

interface BookmarkTarget {
  url: string;
  title: string;
  type: "thread" | "board";
}

interface BookmarkUpdatePayload {
  bookmark?: {
    url?: unknown;
  };
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

function normalizeBookmarkTitle(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function deriveBookmarkTarget(page: Page): BookmarkTarget | null {
  switch (page.type) {
    case "thread":
      return {
        url: page.threadUrl,
        title: normalizeBookmarkTitle(page.title, page.threadUrl),
        type: "thread",
      };

    case "threadList": {
      const title = normalizeBookmarkTitle(
        normalizeString(page.boardTitle, page.title),
        page.boardUrl,
      );
      return {
        url: page.boardUrl,
        title,
        type: "board",
      };
    }

    default:
      return null;
  }
}

function readBookmarkStatus(url: string): boolean {
  try {
    return Boolean(container.bookmark.get(url));
  } catch {
    return false;
  }
}

function deriveBoardTitle(threadUrl: string): string {
  try {
    const parsed = new window.URL(threadUrl);
    const match = parsed.pathname.match(/^\/test\/read\.cgi\/([^/]+)\//);
    if (match) {
      return `${parsed.hostname}/${match[1]}`;
    }
    return parsed.hostname;
  } catch {
    return "";
  }
}

function readBookmarkSources(): OmnibarBookmarkSource[] {
  const bookmarkService = window.app?.bookmark as
    | { getAllThreads?: () => unknown }
    | undefined;

  if (!bookmarkService?.getAllThreads) {
    return [];
  }

  const rawItems = bookmarkService.getAllThreads();
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

      return {
        url,
        title: normalizeString(item.title, url),
        boardTitle: normalizeString(item.boardTitle, deriveBoardTitle(url)),
      };
    })
    .filter((item): item is OmnibarBookmarkSource => item !== null);
}

async function readHistorySources(): Promise<OmnibarHistorySource[]> {
  const historyService = window.app?.History as
    | {
        get?: (offset?: number, count?: number) => Promise<unknown> | unknown;
      }
    | undefined;

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
function navigateByUrl(
  url: string,
  dispatch: ReturnType<typeof useTabStore>["dispatch"],
) {
  const trimmed = url.trim();
  if (!trimmed) return;

  const parsed = parseInternalBrowserPage(trimmed);
  if (parsed) {
    dispatch({
      type: "NAVIGATE",
      page: parsed,
    });
  }
}

export const NavigationBar: React.FC = () => {
  const { state, activeTab, currentPage, dispatch } = useTabStore();
  const { isOpen: isPanelOpen, togglePanel } = useBottomPanel();

  const back = canGoBack(activeTab);
  const forward = canGoForward(activeTab);
  const displayUrl = getDisplayUrl(currentPage);
  const bookmarkTarget = useMemo(
    () => deriveBookmarkTarget(currentPage),
    [currentPage],
  );

  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [backMenuPosition, setBackMenuPosition] = useState<MenuPosition | null>(
    null,
  );
  const [refreshMenuPosition, setRefreshMenuPosition] =
    useState<MenuPosition | null>(null);
  const [forwardMenuPosition, setForwardMenuPosition] =
    useState<MenuPosition | null>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(() =>
    bookmarkTarget ? readBookmarkStatus(bookmarkTarget.url) : false,
  );
  const [isBookmarkPending, setIsBookmarkPending] = useState(false);

  const isThreadAutoRefreshEnabled =
    currentPage.type === "thread" &&
    activeTab.autoRefreshEnabled &&
    activeTab.autoRefreshThreadUrl === currentPage.threadUrl;

  useEffect(() => {
    setIsBookmarkPending(false);
    setIsBookmarked(bookmarkTarget ? readBookmarkStatus(bookmarkTarget.url) : false);
  }, [bookmarkTarget]);

  useEffect(() => {
    if (!bookmarkTarget) {
      return;
    }

    const handleBookmarkUpdated = ({ bookmark }: BookmarkUpdatePayload = {}) => {
      if (typeof bookmark?.url === "string" && bookmark.url !== bookmarkTarget.url) {
        return;
      }

      // 変更理由: 現在ページの星は他UIからの追加・削除にも追従しないと、
      // オムニバー上だけ古い状態に見えて Chrome 風の一貫性が崩れる。
      setIsBookmarked(readBookmarkStatus(bookmarkTarget.url));
      setIsBookmarkPending(false);
    };

    try {
      container.message.on("bookmark_updated", handleBookmarkUpdated);
      return () => {
        container.message.off("bookmark_updated", handleBookmarkUpdated);
      };
    } catch {
      return;
    }
  }, [bookmarkTarget]);

  const loadOmnibarEntries = useCallback(async () => {
    const [historyItems, bookmarkItems, boardItems] = await Promise.all([
      readHistorySources(),
      Promise.resolve(readBookmarkSources()),
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

  const handleToggleBookmark = useCallback(() => {
    if (!bookmarkTarget || isBookmarkPending) {
      return;
    }

    const nextBookmarkedState = !isBookmarked;

    // 変更理由: 永続化イベントを待つだけだとクリック直後に無反応に見えるため、
    // まず星を反転してから bookmark_updated で最終状態へ揃える。
    setIsBookmarkPending(true);
    setIsBookmarked(nextBookmarkedState);

    void Promise.resolve()
      .then(() => {
        if (isBookmarked) {
          return container.bookmark.remove(bookmarkTarget.url);
        }

        return container.bookmark.add({
          url: bookmarkTarget.url,
          title: bookmarkTarget.title,
          type: bookmarkTarget.type,
        });
      })
      .then(() => {
        container.toast.info(
          nextBookmarkedState
            ? "ブックマークに追加しました"
            : "ブックマークを削除しました",
        );
        setIsBookmarked(readBookmarkStatus(bookmarkTarget.url));
      })
      .catch((error: unknown) => {
        setIsBookmarked(readBookmarkStatus(bookmarkTarget.url));
        setIsBookmarkPending(false);
        container.toast.error(
          nextBookmarkedState
            ? "ブックマークの追加に失敗しました"
            : "ブックマークの削除に失敗しました",
        );
        console.error("Bookmark operation failed", error);
      })
      .finally(() => {
        setIsBookmarkPending(false);
      });
  }, [bookmarkTarget, isBookmarked, isBookmarkPending]);

  const openQuickAccessPage = useCallback(
    (page: {
      type: "bookmarkList" | "historyList" | "writeHistoryList";
      title: string;
    }) => {
      dispatch({ type: "NAVIGATE", page });
    },
    [dispatch],
  );

  const openQuickAccessPageInNewTab = useCallback(
    (page: {
      type: "bookmarkList" | "historyList" | "writeHistoryList";
      title: string;
    }) => {
      dispatch({ type: "OPEN_IN_NEW_TAB_FORCE", page });
    },
    [dispatch],
  );

  const handleRefreshContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (currentPage.type !== "thread") {
        return;
      }

      e.preventDefault();
      setMenuPosition(null);
      setBackMenuPosition(null);
      setForwardMenuPosition(null);
      setRefreshMenuPosition((prev) =>
        prev ? null : { x: e.clientX, y: e.clientY },
      );
    },
    [currentPage.type],
  );

  const openSettingsTab = useCallback(() => {
    // 設定タブを毎回増やすより既存タブを再利用した方が往復しやすいため、まず開いている設定を探す。
    const existingSettingsTab = state.tabs.find(
      (tab) => getCurrentPage(tab).type === "settings",
    );

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

  const handleMenuClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
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
    },
    [],
  );

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
      window.dispatchEvent(
        new window.CustomEvent("thread-filter-toolbar-toggle"),
      );
      return;
    }

    if (
      currentPage.type === "historyList" ||
      currentPage.type === "writeHistoryList"
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
            dispatch({ type: "OPEN_IN_NEW_TAB", page });
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
            dispatch({ type: "OPEN_IN_NEW_TAB", page });
          },
        })),
    [activeTab.currentIndex, activeTab.history, dispatch],
  );

  const menuItems = useMemo(
    () => [
      ...(currentPage.type === "thread" ||
      currentPage.type === "historyList" ||
      currentPage.type === "writeHistoryList"
        ? [
            {
              id: "open-filter-toolbar",
              label: "フィルターを開く",
              icon: <Filter size={14} />,
              onSelect: toggleFilterFromMenu,
            },
          ]
        : []),
      ...(currentPage.type === "thread"
        ? [
            {
              id: "open-write-panel",
              label: isPanelOpen
                ? "書き込みパネルを閉じる"
                : "書き込みパネルを開く",
              icon: <PenLine size={14} />,
              onSelect: () => togglePanel("write"),
            },
          ]
        : []),
      {
        id: "open-settings",
        label: "設定を開く",
        icon: <Settings size={14} />,
        onSelect: openSettingsTab,
      },
      {
        id: "quick-access-separator",
        separator: true,
      },
      {
        id: "open-bookmark-list",
        label: "ブックマークリストを開く",
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
        label: "閲覧履歴を開く",
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
        label: "書き込み履歴を開く",
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
    ],
    [
      currentPage.type,
      openQuickAccessPage,
      openQuickAccessPageInNewTab,
      toggleFilterFromMenu,
      openSettingsTab,
      isPanelOpen,
      togglePanel,
    ],
  );

  const refreshMenuItems = useMemo(
    () =>
      currentPage.type === "thread"
        ? [
            {
              id: "toggle-thread-auto-refresh",
              label: isThreadAutoRefreshEnabled
                ? "自動更新を停止"
                : "自動更新を開始",
              icon: isThreadAutoRefreshEnabled ? (
                <Pause size={14} />
              ) : (
                <RotateCw size={14} />
              ),
              onSelect: () => {
                dispatch({
                  type: "SET_AUTO_REFRESH_ENABLED",
                  enabled: !isThreadAutoRefreshEnabled,
                  threadUrl: currentPage.threadUrl,
                });
              },
            },
            {
              id: "thread-auto-refresh-note",
              label: "アクティブなタブでのみ動作",
              disabled: true,
            },
          ]
        : [],
    [currentPage, dispatch, isThreadAutoRefreshEnabled],
  );

  return (
    <div className="nav-bar">
      <button
        ref={backButtonRef}
        className="nav-bar__btn"
        disabled={!back}
        onClick={() => dispatch({ type: "GO_BACK" })}
        onContextMenu={handleBackContextMenu}
        title="戻る"
      >
        <ArrowLeft size={18} />
      </button>
      <button
        ref={forwardButtonRef}
        className="nav-bar__btn"
        disabled={!forward}
        onClick={() => dispatch({ type: "GO_FORWARD" })}
        onContextMenu={handleForwardContextMenu}
        title="進む"
      >
        <ArrowRight size={18} />
      </button>
      <button
        ref={refreshButtonRef}
        className="nav-bar__btn"
        // ブックマーク・履歴・設定などのビューはリロード対象外のため更新を封印する
        disabled={
          currentPage.type !== "thread" && currentPage.type !== "threadList"
        }
        onClick={handleRefresh}
        onContextMenu={handleRefreshContextMenu}
        title="更新"
      >
        <RotateCw size={16} />
      </button>

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

      <button
        ref={menuButtonRef}
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
