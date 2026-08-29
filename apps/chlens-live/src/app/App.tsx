import { useEffect, useState, type ReactElement } from "react";
import { Eye, EyeOff, Pause, Play, RotateCw, Search } from "lucide-react";
import type { ThreadListViewRow } from "../../../../src/view/shared/ThreadListView";
import {
  DEFAULT_OVERLAY_GEOMETRY,
  liveWindowPlatform,
  type OverlayGeometry,
} from "../platform/index";
import {
  createChLensLiveSource,
  createTauriChLensLiveSource,
  type ChLensLiveSource,
} from "../live-session/source";
import { createLiveEventBus } from "../live-session/event-bus";
import { LiveBrowserShell, type LiveTab } from "./LiveBrowserShell";
import { LiveThreadList } from "./LiveThreadList";
import { ThreadView } from "./ThreadView";
import { useLiveBoard, useLiveThread } from "./use-live-sessions";
import { useThreadListController } from "./use-thread-list-controller";
import "./styles.css";

const DEFAULT_BOARD_URL = "http://bbs.eddibb.cc/liveedge/";
const BOARD_TAB_ID = "liveedge-board";

function createDefaultSource(): ChLensLiveSource {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? createTauriChLensLiveSource()
    : createChLensLiveSource();
}

function errorMessage(error: unknown): string | null {
  return error == null ? null : error instanceof Error ? error.message : "取得に失敗しました";
}

export function App(): ReactElement {
  const [source] = useState(createDefaultSource);
  const [eventBus] = useState(createLiveEventBus);
  const [, setGeometry] = useState<OverlayGeometry>(DEFAULT_OVERLAY_GEOMETRY);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [threadFilterOpen, setThreadFilterOpen] = useState(false);
  const [address, setAddress] = useState(DEFAULT_BOARD_URL);
  const [tabs, setTabs] = useState<LiveTab[]>([
    { id: BOARD_TAB_ID, title: "実況板", page: "threadList", url: DEFAULT_BOARD_URL },
  ]);
  const [boardTitle, setBoardTitle] = useState("実況板");
  const [activeTabId, setActiveTabId] = useState(BOARD_TAB_ID);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const selectedThreadUrl = activeTab.page === "thread" ? activeTab.url : null;
  const board = useLiveBoard(DEFAULT_BOARD_URL, { source, intervalMs: null });
  const thread = useLiveThread(selectedThreadUrl, { source, eventBus, intervalMs: 10_000 });
  const threadList = useThreadListController({ threads: board.snapshot?.data ?? [] });

  useEffect(() => {
    if (!source.loadBoardTitle) return;

    let cancelled = false;
    void source
      .loadBoardTitle(DEFAULT_BOARD_URL)
      .then((title) => {
        if (cancelled || !title?.trim()) return;
        setBoardTitle(title.trim());
      })
      .catch((error: unknown) => {
        console.error(`[Chlens Live] board title load failed: ${DEFAULT_BOARD_URL}`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === BOARD_TAB_ID && tab.title !== boardTitle ? { ...tab, title: boardTitle } : tab,
      ),
    );
  }, [boardTitle]);

  useEffect(() => {
    const title = thread.snapshot?.data.title?.trim();
    if (!title || activeTab.page !== "thread" || thread.snapshot?.url !== activeTab.url) return;

    // 変更理由: スレ一覧由来の仮タイトルを残すとタブだけが「実況スレ」のままになるため、
    // ChLensと同じく取得したスレタイトルをタブ名へ反映して識別しやすくする。
    setTabs((current) =>
      current.map((tab) =>
        tab.id === activeTab.id && tab.title !== title ? { ...tab, title } : tab,
      ),
    );
  }, [activeTab, thread.snapshot]);

  useEffect(() => {
    void liveWindowPlatform.setOverlayClickThrough(true).catch((error: unknown) => {
      console.error("[Chlens Live] initial overlay click-through setup failed:", error);
    });
    void liveWindowPlatform
      .loadOverlayGeometry()
      .then((stored) => {
        if (stored) setGeometry(stored);
      })
      .catch((error: unknown) => {
        console.error("[Chlens Live] initial overlay geometry load failed:", error);
      });

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let unwatchGeometry: (() => void) | null = null;
    void liveWindowPlatform
      .watchOverlayGeometry((nextGeometry) => {
        setGeometry(nextGeometry);
        if (saveTimer) clearTimeout(saveTimer);
        // Native move/resize events can arrive in bursts; debounce persistence to avoid
        // writing the same layout repeatedly while the user is dragging the overlay.
        saveTimer = setTimeout(() => {
          saveTimer = null;
          void liveWindowPlatform.saveOverlayGeometry(nextGeometry).catch((error: unknown) => {
            console.error("[Chlens Live] overlay geometry auto-save failed:", error);
          });
        }, 250);
      })
      .then((cleanup) => {
        unwatchGeometry = cleanup;
      })
      .catch((error: unknown) => {
        console.error("[Chlens Live] overlay geometry watcher setup failed:", error);
      });

    return () => {
      if (saveTimer) clearTimeout(saveTimer);
      unwatchGeometry?.();
    };
  }, []);

  const selectThread = (row: ThreadListViewRow): void => {
    const threadData = threadList.threadsById.get(row.id);
    if (!threadData) return;
    const nextTab: LiveTab = {
      id: `thread:${threadData.url}`,
      title: threadData.title,
      page: "thread",
      url: threadData.url,
    };
    setTabs((current) =>
      current.some((tab) => tab.id === nextTab.id) ? current : [...current, nextTab],
    );
    setActiveTabId(nextTab.id);
    setAddress(threadData.url);
  };

  const openAddress = (): void => {
    const normalized = address.trim();
    if (!normalized || normalized === DEFAULT_BOARD_URL) {
      setActiveTabId(BOARD_TAB_ID);
      setAddress(DEFAULT_BOARD_URL);
      return;
    }
    const existing = tabs.find((tab) => tab.url === normalized);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const nextTab: LiveTab = {
      id: `thread:${normalized}`,
      title: "実況スレ",
      page: "thread",
      url: normalized,
    };
    setTabs((current) => [...current, nextTab]);
    setActiveTabId(nextTab.id);
  };

  const closeTab = (tabId: string): void => {
    if (tabId === BOARD_TAB_ID) return;
    setTabs((current) => current.filter((tab) => tab.id !== tabId));
    if (activeTabId === tabId) setActiveTabId(BOARD_TAB_ID);
  };

  const runWindowAction = (operation: string, action: () => Promise<void>): void => {
    // Mainの補助操作はページ遷移を止めないため、失敗を画面へ投げずログへ明示する。
    void action().catch((error: unknown) => {
      console.error(`[Chlens Live] window operation failed: ${operation}`, error);
    });
  };

  const toolbar = (
    <>
      {activeTab.page === "threadList" ? (
        <button
          type="button"
          className="live-icon-button"
          aria-label="タイトルで絞り込み"
          title="タイトルで絞り込み"
          onClick={() => setThreadFilterOpen((open) => !open)}
        >
          <Search size={16} />
        </button>
      ) : null}
      {activeTab.page === "thread" ? (
        <button
          type="button"
          className="live-icon-button"
          aria-label={overlayVisible ? "Overlayを非表示" : "Overlayを表示"}
          title={overlayVisible ? "Overlayを非表示" : "Overlayを表示"}
          onClick={() => {
            const nextVisible = !overlayVisible;
            runWindowAction(
              nextVisible ? "show-overlay" : "hide-overlay",
              nextVisible
                ? () => liveWindowPlatform.showOverlay()
                : () => liveWindowPlatform.hideOverlay(),
            );
            setOverlayVisible(nextVisible);
          }}
        >
          {overlayVisible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      ) : null}
    </>
  );

  return (
    <LiveBrowserShell
      tabs={tabs}
      activeTabId={activeTabId}
      address={address}
      onAddressChange={setAddress}
      onAddressSubmit={openAddress}
      onSelectTab={(tabId) => {
        const tab = tabs.find((candidate) => candidate.id === tabId);
        if (!tab) return;
        setActiveTabId(tabId);
        setAddress(tab.url);
      }}
      onCloseTab={closeTab}
      wheelRefresh={activeTab.page === "threadList" ? board.refresh : thread.refresh}
      wheelLoading={activeTab.page === "threadList" ? board.loading : thread.loading}
      wheelEdge={activeTab.page === "threadList" ? "top" : "bottom"}
      threadAutoRefreshState={
        activeTab.page === "thread"
          ? thread.running
            ? thread.pollingEnabled
              ? "active"
              : "inactive"
            : null
          : null
      }
      primaryAction={
        activeTab.page === "threadList"
          ? {
              label: "更新",
              icon: <RotateCw size={16} />,
              disabled: board.loading,
              onClick: board.refresh,
            }
          : thread.running
            ? { label: "自動更新を停止", icon: <Pause size={16} />, onClick: thread.stop }
            : { label: "自動更新を再開", icon: <Play size={16} />, onClick: thread.start }
      }
      toolbar={toolbar}
    >
      {activeTab.page === "threadList" ? (
        <LiveThreadList
          rows={threadList.rows}
          loading={board.loading}
          error={errorMessage(board.error)}
          query={threadList.query}
          onQueryChange={threadList.setQuery}
          filterOpen={threadFilterOpen}
          onFilterClose={() => setThreadFilterOpen(false)}
          sortColumn={threadList.sortColumn}
          sortDirection={threadList.sortDirection}
          onSort={threadList.sort}
          onSelect={selectThread}
          onMiddleClick={selectThread}
        />
      ) : (
        <ThreadView
          posts={thread.snapshot?.data.posts ?? []}
          error={errorMessage(thread.error)}
          onRefresh={thread.refresh}
          threadUrl={activeTab.url}
          autoRefreshEnabled={thread.running}
          pollingEnabled={thread.pollingEnabled}
          onPollingEnabledChange={thread.setPollingEnabled}
        />
      )}
    </LiveBrowserShell>
  );
}
