import { useEffect, useState, type ReactElement } from "react";
import { ThreadListView, type ThreadListViewRow } from "../../../../src/view/shared/ThreadListView";
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
import { LiveBrowserShell, type LiveTab } from "./LiveBrowserShell";
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
  const [, setGeometry] = useState<OverlayGeometry>(DEFAULT_OVERLAY_GEOMETRY);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [address, setAddress] = useState(DEFAULT_BOARD_URL);
  const [tabs, setTabs] = useState<LiveTab[]>([
    { id: BOARD_TAB_ID, title: "実況板", page: "threadList", url: DEFAULT_BOARD_URL },
  ]);
  const [activeTabId, setActiveTabId] = useState(BOARD_TAB_ID);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const selectedThreadUrl = activeTab.page === "thread" ? activeTab.url : null;
  const board = useLiveBoard(DEFAULT_BOARD_URL, { source, intervalMs: null });
  const thread = useLiveThread(selectedThreadUrl, { source, intervalMs: 10_000 });
  const threadList = useThreadListController({ threads: board.snapshot?.data ?? [] });

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
      {activeTab.page === "threadList" && (
        <button
          type="button"
          className="live-icon-button"
          aria-label="スレ一覧を更新"
          title="スレ一覧を更新"
          onClick={board.refresh}
        >
          ↻
        </button>
      )}
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
        {overlayVisible ? "◉" : "○"}
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
      toolbar={toolbar}
    >
      {activeTab.page === "threadList" ? (
        <ThreadListView
          rows={threadList.rows}
          loading={board.loading}
          error={errorMessage(board.error)}
          query={threadList.query}
          onQueryChange={threadList.setQuery}
          sortColumn={threadList.sortColumn}
          sortDirection={threadList.sortDirection}
          onSort={threadList.sort}
          onSelect={selectThread}
          onMiddleClick={selectThread}
        />
      ) : (
        <ThreadView
          title={thread.snapshot?.data.title ?? activeTab.title}
          posts={thread.snapshot?.data.posts ?? []}
          loading={thread.loading}
          error={errorMessage(thread.error)}
          datFall={false}
          onRefresh={thread.refresh}
          onStop={thread.stop}
        />
      )}
    </LiveBrowserShell>
  );
}
