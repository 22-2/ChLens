import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AutoScrollPaneStatesProvider } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import {
  type AuxiliaryWindowWatcher,
  watchAuxiliaryWindow,
} from "src/features/auxiliary-window/browser/auxiliary-window-watcher";
import {
  type AuxiliaryWindowHandle,
  type AuxiliaryWindowOptions,
  openAuxiliaryWindow,
} from "src/features/auxiliary-window/browser/use-auxiliary-window";
import {
  type DetachedTabController,
  DetachedTabControllerContext,
} from "src/features/tabs/browser/detached-tab-controller";
import { useTabBarOrientation } from "src/features/tabs/browser/use-tab-bar-orientation";
import { WindowNavigationBridge } from "src/features/tabs/ui/WindowNavigationBridge";
import { useZenMode } from "src/view/browser/commands/zen-mode-store";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { WindowShell } from "src/view/browser/shell/WindowShell";
import {
  useAllPanes,
  useTabDispatch,
  useTabStore,
} from "src/view/browser/state/tabs/use-tab-store";
import { WindowScopeProvider } from "src/view/browser/state/tabs/use-window-scope";
import { MAIN_WINDOW_ID } from "src/view/browser/state/tabs/window-model";
import { getCurrentPage, type Pane, type Tab } from "src/view/browser/types";
import { ToastProvider } from "src/view/browser/ui/Toast";

interface WindowEntry extends AuxiliaryWindowHandle {
  id: string;
  watcher: AuxiliaryWindowWatcher;
}
function locate(panes: readonly Pane[], tabId: string): { pane: Pane; tab: Tab } | undefined {
  for (const pane of panes) {
    const tab = pane.tabs.find((item) => item.id === tabId);
    if (tab) return { pane, tab };
  }
  return undefined;
}
function optionsFor(tab: Tab, windowId: string): AuxiliaryWindowOptions {
  return {
    // 元のタブが別の窓へ移動しても、名前付き窓の再利用先が衝突しないようにする。
    name: `chlens-window-${encodeURIComponent(windowId)}`,
    features: "popup,width=1180,height=820,resizable=yes",
    title: `${getCurrentPage(tab).title || "タブ"} - read.crx 2`,
    shellClassName: "workspace-window",
    logLabel: "WindowHost",
  };
}

/** WindowProxyの寿命を窓IDで管理し、表示は本窓と同じシェルへ委ねる。 */
export const WindowHost: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { panes } = useAllPanes();
  const { stateRef } = useTabStore();
  const dispatch = useTabDispatch();
  const theme = useTheme();
  const orientation = useTabBarOrientation();
  const isZenMode = useZenMode();
  const [entries, setEntries] = useState<Map<string, WindowEntry>>(() => new Map());
  const entriesRef = useRef(entries);
  const parentClosing = useRef(false);
  const closeRef = useRef<(id: string) => void>(() => {});
  const setEntry = useCallback((id: string, entry: WindowEntry | null) => {
    const next = new Map(entriesRef.current);
    if (entry) next.set(id, entry);
    else next.delete(id);
    entriesRef.current = next;
    setEntries(next);
  }, []);
  const closeWindow = useCallback(
    (id: string) => {
      const entry = entriesRef.current.get(id);
      if (!entry) return;
      // 監視を先に解除し、OS終了とプログラム終了を二重に扱わない。
      entry.watcher.release();
      setEntry(id, null);
      if (!parentClosing.current) dispatch({ type: "CLOSE_WORKSPACE_WINDOW", windowId: id });
    },
    [dispatch, setEntry],
  );
  useLayoutEffect(() => {
    closeRef.current = closeWindow;
  }, [closeWindow]);
  const detachTab = useCallback(
    (tabId: string) => {
      const found = locate(stateRef.current.panes, tabId);
      if (!found) return false;
      const existing = entriesRef.current.get(found.pane.windowId ?? MAIN_WINDOW_ID);
      if (existing && !existing.window.closed) {
        existing.window.focus();
        return true;
      }
      const id = crypto.randomUUID();
      const opened = openAuxiliaryWindow(optionsFor(found.tab, id));
      if (!opened) return false;
      const paneId = crypto.randomUUID();
      const watcher = watchAuxiliaryWindow({
        window: opened.window,
        sourceDocument: document,
        isCurrent: () => entriesRef.current.get(id)?.window === opened.window,
        getReconnectOptions: () => {
          const pane = stateRef.current.panes.find((item) => item.windowId === id);
          const tab = pane?.tabs.find((item) => item.id === pane.activeTabId);
          return tab ? optionsFor(tab, id) : null;
        },
        onClosed: () => closeRef.current(id),
        onReconnect: (root) => {
          const entry = entriesRef.current.get(id);
          if (entry?.window === opened.window) setEntry(id, { ...entry, root });
        },
      });
      setEntry(id, { ...opened, id, watcher });
      dispatch({ type: "TRANSFER_TAB", tabId, to: { newWindowId: id, newPaneId: paneId } });
      opened.window.focus();
      return true;
    },
    [dispatch, setEntry, stateRef],
  );
  const reattachTab = useCallback(
    (tabId: string) => {
      const main = stateRef.current.windows.find((item) => item.id === MAIN_WINDOW_ID);
      const pane = stateRef.current.panes.find((item) => item.id === main?.activePaneId);
      if (pane)
        dispatch({
          type: "TRANSFER_TAB",
          tabId,
          to: { windowId: MAIN_WINDOW_ID, paneId: pane.id, index: pane.tabs.length },
        });
    },
    [dispatch, stateRef],
  );
  const focusTabWindow = useCallback(
    (tabId: string) => {
      const found = locate(stateRef.current.panes, tabId);
      const entry = found && entriesRef.current.get(found.pane.windowId ?? MAIN_WINDOW_ID);
      if (entry && !entry.window.closed) entry.window.focus();
    },
    [stateRef],
  );
  const closeDetachedTab = useCallback(
    (tabId: string) => {
      const found = locate(stateRef.current.panes, tabId);
      if (found?.pane.windowId) closeWindow(found.pane.windowId);
    },
    [closeWindow, stateRef],
  );
  const context = useMemo<DetachedTabController>(
    () => ({ detachTab, reattachTab, focusTabWindow, closeDetachedTab }),
    [detachTab, reattachTab, focusTabWindow, closeDetachedTab],
  );
  useEffect(() => {
    const onPageHide = () => {
      parentClosing.current = true;
    };
    window.addEventListener("pagehide", onPageHide, { capture: true });
    const monitor = window.setInterval(() => {
      for (const [id, entry] of entriesRef.current) if (entry.window.closed) closeRef.current(id);
    }, 250);
    return () => {
      window.removeEventListener("pagehide", onPageHide, { capture: true });
      window.clearInterval(monitor);
      for (const entry of entriesRef.current.values()) entry.watcher.release();
    };
  }, []);
  useEffect(() => {
    for (const [id, entry] of entriesRef.current) {
      if (!stateRef.current.windows.some((item) => item.id === id)) {
        entry.watcher.release();
        setEntry(id, null);
        continue;
      }
      const windowState = stateRef.current.windows.find((item) => item.id === id);
      const pane = panes.find((item) => item.id === windowState?.activePaneId);
      const tab = pane?.tabs.find((item) => item.id === pane.activeTabId);
      if (tab && !entry.window.closed) {
        entry.window.document.title = `${getCurrentPage(tab).title || "タブ"} - read.crx 2`;
        entry.root.dataset.theme = theme;
        entry.root.dataset.tabOrientation = orientation;
        entry.root.dataset.zenMode = isZenMode ? "true" : "false";
      }
    }
  }, [entries, panes, setEntry, stateRef, theme, orientation, isZenMode]);
  return (
    <DetachedTabControllerContext.Provider value={context}>
      {children}
      {[...entries.values()].map((entry) => {
        if (entry.window.closed || !stateRef.current.windows.some((item) => item.id === entry.id))
          return null;
        return createPortal(
          <ViewSurfaceProvider surface={{ window: entry.window, document: entry.window.document }}>
            <WindowScopeProvider windowId={entry.id}>
              <AutoScrollPaneStatesProvider>
                <WindowNavigationBridge manageBrowserHistory={false} />
                <ToastProvider topOffset="var(--sys-space-13)" rightOffset="var(--sys-space-4)" />
                <WindowShell showSidePanel={false} />
              </AutoScrollPaneStatesProvider>
            </WindowScopeProvider>
          </ViewSurfaceProvider>,
          entry.root,
          entry.id,
        );
      })}
    </DetachedTabControllerContext.Provider>
  );
};
