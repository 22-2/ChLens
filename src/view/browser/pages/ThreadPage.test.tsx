import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { ThreadPage } from "src/view/browser/pages/ThreadPage";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// ThreadPage は多数の機能を組み合わせる画面の入口。ここでは、通信・タイマー・ポップアップなど
// 外部に作用する部品だけを差し替え、画面が状態をどの部品へ渡し、どの表示を出すかを確かめる。
// 差し替えた部品は、受け取った値をそのまま返すか、呼び出しを記録するだけにする。
const h = vi.hoisted(() => ({
  threadData: {} as Record<string, unknown>,
  autoRefresh: {
    props: null as Record<string, unknown> | null,
    canAutoScroll: false,
  },
  nextThread: { pendingMove: null as Record<string, unknown> | null },
  dispatch: vi.fn(),
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
  runTabCommand: vi.fn(() => true),
}));

// 画面が取り込む実モジュールの一部は、読み込み時に拡張機能の API を参照する。この画面のテストでは使わない。
vi.mock("webextension-polyfill", () => ({ default: {} }));

vi.mock("src/app/debug/debug-api", () => ({
  registerDebugStateProvider: () => () => {},
}));

vi.mock("src/features/auto-refresh/browser/auto-refresh-config", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("src/features/auto-refresh/browser/auto-refresh-config")
  >()),
  readThreadAutoRefreshIntervalSec: () => 60,
}));

vi.mock("src/features/auto-refresh/browser/use-popup-auto-scroll-pause-setting", () => ({
  usePopupAutoScrollPauseSetting: () => ({ enabled: false }),
}));

vi.mock("src/features/auto-refresh/browser/use-thread-auto-refresh", () => ({
  useThreadAutoRefresh: (props: Record<string, unknown>) => {
    h.autoRefresh.props = props;
    return {
      autoScrollBoundaryRef: { current: null },
      canAutoScroll: h.autoRefresh.canAutoScroll,
      isAutoScrolling: false,
    };
  },
}));

vi.mock("src/features/comment-overlay/application/use-comment-overlay", () => ({
  useCommentOverlay: () => ({
    controller: {
      start: vi.fn(async () => undefined),
      publishSystemMessage: vi.fn(async () => undefined),
    },
    snapshot: { state: { status: "idle", targetThreadUrl: null }, visible: false },
  }),
}));

vi.mock("src/features/live-chat/browser/use-live-chat-reply-index", () => ({
  useLiveChatReplyIndex: () => ({
    repIndex: new Map(),
    replySourceNums: new Set(),
    onEntryDisplayed: vi.fn(),
  }),
}));

vi.mock("src/features/live-chat/browser/use-live-chat-responses", () => ({
  useLiveChatResponses: ({ responses }: { responses: unknown[] }) => ({
    responses,
    isFlowing: false,
    baseline: 0,
    pendingCount: 0,
    isDraining: false,
  }),
}));

vi.mock("src/features/live-chat/browser/use-thread-display-mode-setting", () => ({
  useThreadDisplayModeSetting: () => ({ mode: "normal" }),
}));

vi.mock("src/features/media/ui/MediaViewerContainer", () => ({
  MediaViewerContainer: () => null,
}));

vi.mock("src/features/next-thread/browser/use-auto-next-thread", () => ({
  useAutoNextThread: () => ({
    pendingMove: h.nextThread.pendingMove,
    cancelPendingMove: vi.fn(),
    selectPendingCandidate: vi.fn(),
  }),
}));

vi.mock("src/features/next-thread/browser/use-auto-next-thread-setting", () => ({
  useAutoNextThreadSetting: () => ({
    enabled: false,
    mode: "auto",
    searchDurationSeconds: 30,
  }),
}));

vi.mock("src/features/next-thread/ui/NextThreadSearchDialog", async () => {
  const { createElement } = await import("react");
  return {
    NextThreadSearchDialog: ({ autoMoveCountdown }: { autoMoveCountdown: number }) =>
      createElement("div", { role: "dialog" }, `次スレへ移動まで${autoMoveCountdown}秒`),
  };
});

vi.mock("src/features/popup/browser/use-popup-manager", () => ({
  useThreadPopupManager: () => ({
    popups: [],
    anchorPreviews: [],
    treePopupItems: [],
    idPopupItems: [],
    contextMenuItems: [],
    hasAnchorPreviews: false,
    addTreePopup: vi.fn(),
    addPopupContextMenu: vi.fn(),
    addIdPopup: vi.fn(),
    clearAnchorPreviewHideTimer: vi.fn(),
    closeNonContextPopups: vi.fn(),
    closePopupById: vi.fn(),
    closePopupChildren: vi.fn(),
    isPopupDescendantOf: () => false,
    toggleTreePopupPinned: vi.fn(),
    toggleIdPopupPinned: vi.fn(),
    toggleAnchorPopupPinned: vi.fn(),
    hasPopupChild: () => false,
    hideAnchorPreview: vi.fn(),
    hideAnchorPreviewImmediately: vi.fn(),
    showAnchorPreview: vi.fn(),
  }),
}));

vi.mock("src/features/popup/ui/PopupRenderer", () => ({
  PopupRenderer: () => null,
}));

vi.mock("src/features/tabs/browser/use-tab-command-runner", () => ({
  useTabCommandRunner: () => h.runTabCommand,
}));

vi.mock("src/features/tabs/browser/use-tab-view-runtime", () => ({
  useTabViewRuntime: () => ({
    surface: { window, document },
    dispatch: h.dispatch,
    toast: h.toast,
  }),
}));

vi.mock("src/features/thread/browser/use-stored-read-state", () => ({
  useStoredReadState: () => null,
}));

vi.mock("src/features/thread/browser/use-thread-data", () => ({
  useThreadData: () => h.threadData,
}));

vi.mock("src/features/thread/browser/use-thread-find", () => ({
  useThreadFind: () => ({
    isOpen: false,
    query: "",
    total: 0,
    activeIndex: 0,
    focusKey: 0,
    setQuery: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    close: vi.fn(),
    highlightQuery: "",
    activeMatch: null,
  }),
}));

vi.mock("src/features/thread/browser/use-thread-refresh-controller", () => ({
  useThreadRefreshController: () => ({}),
}));

vi.mock("src/features/thread/browser/use-thread-snapshot-publisher", () => ({
  useThreadSnapshotPublisher: () => undefined,
}));

vi.mock("src/features/thread/browser/use-thread-virtual-list", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/features/thread/browser/use-thread-virtual-list")>()),
  useThreadVirtualList: ({ responses }: { responses: { num: number }[] }) => ({
    virtualizer: {},
    keys: responses.map((response) => response.num),
    highlightKey: null,
    onHighlightApplied: vi.fn(),
    layout: {},
    measureReadState: () => null,
    measureVirtualReadState: () => null,
    highlightResponse: vi.fn(),
    scrollToResponse: vi.fn(),
  }),
}));

vi.mock("src/features/thread/browser/useWheelPagination", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/features/thread/browser/useWheelPagination")>()),
  useWheelPagination: () => ({}),
}));

vi.mock("src/features/thread/ui/ResItem", async () => {
  const { createElement } = await import("react");
  return {
    ResItem: ({ res }: { res: { num: number; message: string } }) =>
      createElement("div", { "data-testid": "res-item", "data-num": String(res.num) }, res.message),
  };
});

vi.mock("src/features/thread/ui/ThreadFindBar", () => ({ ThreadFindBar: () => null }));
vi.mock("src/features/thread/ui/ThreadMinimap", () => ({ ThreadMinimap: () => null }));
vi.mock("src/features/thread/ui/ThreadScrollFloatingActions", () => ({
  ThreadScrollFloatingActions: () => null,
}));
vi.mock("src/features/thread/ui/WheelScrollIndicator", () => ({
  WheelScrollIndicator: () => null,
}));

vi.mock("src/features/thread/ui/VirtualResList", async () => {
  const { createElement } = await import("react");
  return {
    VirtualResList: ({
      keys,
      renderItem,
    }: {
      keys: (number | string)[];
      renderItem: (key: number | string) => unknown;
    }) =>
      createElement(
        "div",
        { "data-testid": "virtual-list" },
        keys.map((key) => createElement("div", { key: String(key) }, renderItem(key) as never)),
      ),
  };
});

vi.mock("src/view/browser/components/OperationStatusItem", () => ({
  OperationStatusItem: () => null,
}));

vi.mock("src/view/browser/hooks/use-mouse-gesture", () => ({
  useMouseGesture: () => undefined,
}));

vi.mock("src/view/browser/pages/thread/ThreadPageTopBar", () => ({
  ThreadPageTopBar: () => null,
}));

vi.mock("src/view/browser/pages/thread/use-comment-overlay-handoff", () => ({
  useCommentOverlayHandoff: () => undefined,
}));

vi.mock("src/view/browser/pages/thread/use-comment-overlay-sync", () => ({
  useCommentOverlaySync: () => undefined,
}));

vi.mock("src/view/browser/pages/thread/use-image-blur-config", () => ({
  useImageBlurConfig: () => ({ enabled: false, radius: 4, harmfulWordPattern: null }),
}));

vi.mock("src/view/browser/pages/thread/use-own-res-tracking", () => ({
  useOwnResTracking: () => ({
    ownResNums: new Set(),
    handleWriteHistoryAdded: vi.fn(),
    handleWriteHistoryRemoved: vi.fn(),
  }),
}));

vi.mock("src/view/browser/pages/thread/use-res-interaction-handlers", () => ({
  useResInteractionHandlers: () => ({
    openAnchorPreviewFromPopup: vi.fn(),
    handleIdClick: vi.fn(),
    handlePopupIdClick: vi.fn(),
    handleRepClick: vi.fn(),
    closePopup: vi.fn(),
    handleRepClickInPopup: vi.fn(),
    handleOpenRootReplyTreeInPopup: vi.fn(),
    handleAnchorClick: vi.fn(),
  }),
}));

vi.mock("src/view/browser/pages/thread/use-thread-blurred-res-nums", () => ({
  useThreadBlurredResNums: () => new Set(),
}));

vi.mock("src/view/browser/pages/thread/use-thread-context-menu-header", () => ({
  useThreadContextMenuHeader: () => vi.fn(),
}));

vi.mock("src/view/browser/pages/thread/use-thread-filter-default-open-setting", () => ({
  useThreadFilterDefaultOpenSetting: () => false,
}));

vi.mock("src/view/browser/pages/thread/use-thread-filter-mode-toggle", () => ({
  useThreadFilterModeToggle: () => undefined,
}));

vi.mock("src/view/browser/pages/thread/use-thread-read-position-mode", () => ({
  useThreadReadPositionMode: () => "auto",
}));

vi.mock("src/view/browser/pages/thread/use-thread-read-state", () => ({
  useThreadReadState: () => ({
    scrollToResponse: vi.fn(),
    isInitialReadStateResolved: true,
    markReadThrough: vi.fn(),
  }),
}));

vi.mock("src/view/browser/pages/thread/use-thread-reply-notification", () => ({
  useThreadReplyNotification: () => vi.fn(),
}));

vi.mock("src/view/browser/pages/thread/use-thread-res-context-menu", () => ({
  useThreadResContextMenu: () => ({
    openPopupResContextMenu: vi.fn(),
    openThreadResContextMenu: vi.fn(),
  }),
}));

vi.mock("src/view/browser/pages/thread/use-thread-status-sync", () => ({
  useThreadStatusSync: () => ({ ngResNums: new Set() }),
}));

vi.mock("src/view/browser/pages/thread/use-thread-top-bar", () => ({
  useThreadTopBar: () => ({
    activeTopBar: "none",
    closeTopBar: vi.fn(),
    closeTopBarPreservingFilter: vi.fn(),
    openFilterToolbar: vi.fn(),
    searchFocusKey: 0,
    suppressInitialFocus: false,
  }),
}));

vi.mock("src/view/browser/pages/thread/use-thread-top-scroll-open-filter", () => ({
  useThreadTopScrollOpenFilter: () => undefined,
}));

vi.mock("src/view/browser/pages/thread/use-url-handlers", () => ({
  useUrlHandlers: () => ({
    handleUrlClick: vi.fn(),
    handleUrlContextMenu: vi.fn(),
    openPopupUrlContextMenu: vi.fn(),
  }),
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/view/browser/state/tabs/use-tab-store")>()),
  useTabStore: () => ({ viewTab: { id: "tab-view", history: [], currentIndex: 0 } }),
}));

vi.mock("src/view/browser/state/thread-res-interactions", () => ({
  registerThreadResInteractions: () => () => {},
}));

const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";
const THREAD_PAGE: ThreadPageType = { type: "thread", title: "テストスレ", threadUrl: THREAD_URL };
const RES_1 = {
  num: 1,
  name: "名無しさん",
  mail: "",
  date: "2026/09/30 12:00:00",
  message: "一つ目",
};
const RES_2 = {
  num: 2,
  name: "名無しさん",
  mail: "",
  date: "2026/09/30 12:01:00",
  message: "二つ目",
};

/** 画面の状態を表すデータ。テストごとに、必要な項目だけを上書きして使う。 */
function createThreadData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    responses: [],
    visibleResponses: [],
    loading: false,
    isInitialLoading: false,
    isCacheResolved: true,
    error: null,
    expired: false,
    missingFromSubject: false,
    indexes: { repIndex: new Map(), resMap: new Map(), idIndex: new Map() },
    filteredResponses: [],
    filterCounts: { popular: 0, image: 0, video: 0, link: 0 },
    filter: "all",
    setFilter: vi.fn(),
    searchTarget: "all",
    setSearchTarget: vi.fn(),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    fetchThread: vi.fn(),
    idPositions: new Map(),
    setResponses: vi.fn(),
    messageProtocol: "https:",
    ...overrides,
  };
}

type Props = ComponentProps<typeof ThreadPage>;

// 手動更新は同じタブ・同じページの範囲で一定時間再実行できないため、テストごとに別のタブとして描画する。
let tabSeq = 0;

function renderThreadPage(overrides: Partial<Props> = {}) {
  tabSeq += 1;
  const props: Props = {
    tabId: `tab-${tabSeq}`,
    page: THREAD_PAGE,
    refreshKey: 0,
    isActive: true,
    isAutoRefreshEnabled: false,
    startAutoRefreshAtBottom: false,
    ...overrides,
  };
  return render(<ThreadPage {...props} />);
}

describe("ThreadPage の組み立て", () => {
  setupTestPageTypes();

  beforeEach(() => {
    vi.clearAllMocks();
    h.threadData = createThreadData();
    h.autoRefresh.props = null;
    h.autoRefresh.canAutoScroll = false;
    h.nextThread.pendingMove = null;
  });

  afterEach(() => {
    cleanup();
  });

  describe("本文の表示状態", () => {
    it("読み込み中は、本文の代わりに読み込み中の表示を出す", () => {
      h.threadData = createThreadData({ isInitialLoading: true, loading: true });

      renderThreadPage();

      expect(screen.getByRole("status", { name: "スレッドを読み込み中" })).toBeInTheDocument();
      expect(screen.queryByTestId("virtual-list")).toBeNull();
    });

    it("本文がなく取得に失敗したときは、エラーと再試行を出し、再試行では全件を取得し直す", () => {
      const fetchThread = vi.fn();
      h.threadData = createThreadData({ error: "通信に失敗しました", fetchThread });

      renderThreadPage();

      expect(screen.getByText("通信に失敗しました")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "再試行" }));
      expect(fetchThread).toHaveBeenCalledWith(true);
    });

    it("本文を表示したまま取得に失敗したときは、本文を残してエラーを通知として出し、再試行は出さない", () => {
      h.threadData = createThreadData({
        responses: [RES_1],
        filteredResponses: [RES_1],
        error: "更新に失敗しました",
      });

      renderThreadPage();

      expect(screen.getByText("更新に失敗しました")).toBeInTheDocument();
      expect(screen.getByTestId("res-item")).toHaveTextContent("一つ目");
      expect(screen.queryByRole("button", { name: "再試行" })).toBeNull();
    });

    it("dat落ちのスレッドでは、本文の上に通知を出し、親から渡された関連スレ検索を実行できる", () => {
      const onSearchRelatedThreads = vi.fn().mockResolvedValue(undefined);
      h.threadData = createThreadData({ expired: true });

      renderThreadPage({ onSearchRelatedThreads });

      expect(screen.getByRole("status")).toHaveTextContent("このスレッドはdat落ちしています");
      fireEvent.click(screen.getByRole("button", { name: "関連スレを探す" }));
      expect(onSearchRelatedThreads).toHaveBeenCalledTimes(1);
    });

    it("表示中のタブはレスを一覧として描画し、非表示のタブは描画しない", () => {
      h.threadData = createThreadData({
        responses: [RES_1, RES_2],
        filteredResponses: [RES_1, RES_2],
      });

      const { unmount } = renderThreadPage({ isActive: true });
      expect(screen.getAllByTestId("res-item").map((item) => item.dataset.num)).toEqual(["1", "2"]);
      unmount();

      renderThreadPage({ isActive: false });
      expect(screen.queryAllByTestId("res-item")).toHaveLength(0);
    });
  });

  describe("絞り込みと検索", () => {
    it("初期表示のレス指定があると、保存済みの絞り込みと検索語を解除する", () => {
      const setFilter = vi.fn();
      const setSearchQuery = vi.fn();
      h.threadData = createThreadData({ setFilter, setSearchQuery });

      renderThreadPage({ page: { ...THREAD_PAGE, initialResNum: 3 } });

      expect(setFilter).toHaveBeenCalledWith("all");
      expect(setSearchQuery).toHaveBeenCalledWith("");
    });

    it("検索語があると、自動更新の追従表示を出さない", () => {
      h.threadData = createThreadData({ searchQuery: "絞り込み中" });

      renderThreadPage({ isAutoRefreshEnabled: true });

      expect(screen.queryByText(/新着に追従します/)).toBeNull();
    });
  });

  describe("自動更新", () => {
    it("自動更新中で絞り込みがないときは、判定線の下にいるかを示す", () => {
      renderThreadPage({ isAutoRefreshEnabled: true });

      expect(screen.getByText("この線より下にいる時だけ新着に追従します")).toBeInTheDocument();
    });

    it("判定線の下で追従できる状態のときは、新着に追従する旨を示す", () => {
      h.autoRefresh.canAutoScroll = true;

      renderThreadPage({ isAutoRefreshEnabled: true });

      expect(screen.getByText("この線より下なので新着に追従します")).toBeInTheDocument();
    });

    it("dat落ちを検出すると停止記録を付け、以後の自動更新の開始を拒否できるようにする", () => {
      renderThreadPage({ isAutoRefreshEnabled: true });

      const props = h.autoRefresh.props as { onThreadExpiredDetected: () => void };
      props.onThreadExpiredDetected();

      expect(h.dispatch).toHaveBeenCalledWith(
        tabActions.setAutoRefreshStoppedPageKey(getAutoRefreshPageKey(THREAD_PAGE)!),
      );
    });

    it("dat落ちで自動更新が止まると、自動更新をOFFにして停止理由を通知する", () => {
      renderThreadPage({ isAutoRefreshEnabled: true });

      const props = h.autoRefresh.props as { onThreadExpired: () => void };
      props.onThreadExpired();

      expect(h.dispatch).toHaveBeenCalledWith(
        tabActions.setAutoRefreshEnabled(false, getAutoRefreshPageKey(THREAD_PAGE)!),
      );
      expect(h.toast.info).toHaveBeenCalledWith(expect.any(String));
    });

    it("停止の記録済みで自動更新がOFFなら、dat落ちの停止通知を重ねない", () => {
      const stoppedTab = {
        id: "tab-stopped",
        history: [THREAD_PAGE],
        currentIndex: 0,
        pinned: false,
        autoRefreshEnabled: false,
        autoRefreshPageKey: null,
        autoRefreshStoppedPageKey: getAutoRefreshPageKey(THREAD_PAGE),
      } as unknown as Props["tab"];
      renderThreadPage({ tab: stoppedTab, isAutoRefreshEnabled: false });

      const props = h.autoRefresh.props as { onThreadExpired: () => void };
      props.onThreadExpired();

      expect(h.dispatch).not.toHaveBeenCalled();
      expect(h.toast.info).not.toHaveBeenCalled();
    });

    it("新着の再取得は、タブの再読み込みコマンドとして実行する", () => {
      renderThreadPage({ isAutoRefreshEnabled: true });

      const props = h.autoRefresh.props as { requestRefresh: () => void };
      props.requestRefresh();

      expect(h.runTabCommand).toHaveBeenCalledWith(TAB_COMMAND_IDS.RELOAD);
    });

    it("次スレへの自動移動の候補があると、移動までの確認画面を出す", () => {
      h.nextThread.pendingMove = {
        sourceThread: { title: "テストスレ", url: THREAD_URL },
        candidates: [],
        remainingSeconds: 7,
      };

      renderThreadPage({ isAutoRefreshEnabled: true });

      expect(screen.getByRole("dialog")).toHaveTextContent("次スレへ移動まで7秒");
    });
  });
});
