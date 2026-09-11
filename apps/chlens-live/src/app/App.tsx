import "./styles.css";

import { Eye, EyeOff, Pause, Play, RotateCw, Search, SlidersHorizontal } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import type { CommentOverlayMonitor } from "src/features/comment-overlay/platform";
import { OverlayControlPanel } from "src/features/comment-overlay/ui/OverlayControlPanel";

import type { ThreadListViewRow } from "../../../../src/view/shared/ThreadListView";
import { createLiveEventBus } from "../live-session/event-bus";
import {
  type ChLensLiveSource,
  createChLensLiveSource,
  createTauriChLensLiveSource,
} from "../live-session/source";
import {
  DEFAULT_OVERLAY_GEOMETRY,
  liveWindowPlatform,
  type OverlayGeometry,
} from "../platform/index";
import { LiveBrowserShell, type LiveTab } from "./LiveBrowserShell";
import { LiveThreadList } from "./LiveThreadList";
import { ThreadView } from "./ThreadView";
import { useLiveBoard, useLiveThread } from "./use-live-sessions";
import { useThreadListController } from "./use-thread-list-controller";

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
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [controlPanelMonitors, setControlPanelMonitors] = useState<
    readonly CommentOverlayMonitor[]
  >([]);
  const [controlPanelGeometry, setControlPanelGeometry] = useState<OverlayGeometry | null>(null);
  const controlPanelWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        // nativeの移動・リサイズeventは連続して届くため、ドラッグ中の同じlayout保存を
        // debounceしてlocalStorageへの書き込みを抑える。
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

  useEffect(() => {
    if (!isControlPanelOpen) return;
    // 変更理由: Overlayは表示専用に固定したため、実モニターと現在geometryを
    // Mainの操作パネルを開いた時だけ取得し、Overlay側の再計測を発生させない。
    let disposed = false;
    void Promise.all([
      liveWindowPlatform.getOverlayMonitors(),
      liveWindowPlatform.getOverlayGeometry(),
    ])
      .then(([nextMonitors, nextGeometry]) => {
        if (disposed) return;
        setControlPanelMonitors(nextMonitors);
        setControlPanelGeometry(nextGeometry);
      })
      .catch((error: unknown) => {
        console.error("[Chlens Live] overlay control panel initialization failed:", error);
      });
    return () => {
      disposed = true;
    };
  }, [isControlPanelOpen]);

  useEffect(() => {
    return () => {
      if (controlPanelWriteTimerRef.current) clearTimeout(controlPanelWriteTimerRef.current);
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

  const handleControlPanelGeometryChange = (nextGeometry: OverlayGeometry): void => {
    // 変更理由: ドラッグ中の連続座標を40ms単位へまとめ、表示の追従性とnative IPC量を両立する。
    setControlPanelGeometry(nextGeometry);
    if (controlPanelWriteTimerRef.current) clearTimeout(controlPanelWriteTimerRef.current);
    controlPanelWriteTimerRef.current = setTimeout(() => {
      controlPanelWriteTimerRef.current = null;
      void liveWindowPlatform
        .setOverlayGeometry(nextGeometry)
        .then(() => liveWindowPlatform.saveOverlayGeometry(nextGeometry))
        .catch((error: unknown) => {
          console.error("[Chlens Live] overlay control panel geometry update failed:", error);
        });
    }, 40);
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
      <button
        type="button"
        className="live-icon-button"
        aria-label={isControlPanelOpen ? "Overlay操作パネルを閉じる" : "Overlay操作パネルを開く"}
        title={isControlPanelOpen ? "Overlay操作パネルを閉じる" : "Overlay操作パネルを開く"}
        onClick={() => setIsControlPanelOpen((open) => !open)}
      >
        <SlidersHorizontal size={16} />
      </button>
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
      {isControlPanelOpen ? (
        <aside className="live-overlay-control-panel">
          <OverlayControlPanel
            monitors={controlPanelMonitors}
            geometry={controlPanelGeometry}
            onGeometryChange={handleControlPanelGeometryChange}
          />
        </aside>
      ) : null}
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
