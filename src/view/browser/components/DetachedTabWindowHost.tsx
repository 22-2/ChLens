import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StatusBarProvider } from "src/view/browser/components/StatusBar";
import { TabPanel } from "src/view/browser/components/TabView";
import {
  DetachedTabWindowContext,
  type DetachedTabWindowContextValue,
} from "src/view/browser/hooks/detached-tab-context";
import { AutoScrollStateProvider } from "src/view/browser/hooks/use-auto-scroll-state";
import {
  type DetachedWindowHandle,
  type DetachedWindowOptions,
  openDetachedWindow,
} from "src/view/browser/hooks/use-detached-window";
import { NgStatusProvider } from "src/view/browser/hooks/use-ng-status";
import { PageCountStatusProvider } from "src/view/browser/hooks/use-page-count-status";
import {
  PaneProvider,
  useTabDispatchForTab,
  useTabPanes,
} from "src/view/browser/hooks/use-tab-store";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { type ViewSurface, ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import {
  canGoBack,
  canGoForward,
  getCurrentPage,
  type Page,
  type Pane,
  type Tab,
} from "src/view/browser/types";
import { ToastProvider } from "src/view/browser/ui/Toast";

interface DetachedTabWindowEntry extends DetachedWindowHandle {
  tabId: string;
  onBeforeUnload: () => void;
}

function findTab(panes: readonly Pane[], tabId: string): { tab: Tab; paneId: string } | null {
  for (const pane of panes) {
    const tab = pane.tabs.find((candidate) => candidate.id === tabId);
    if (tab) {
      return { tab, paneId: pane.id };
    }
  }
  return null;
}

function isDetachablePage(page: Page): boolean {
  return page.type === "thread" || page.type === "threadList";
}

function createDetachedTabOptions(tab: Tab): DetachedWindowOptions {
  const page = getCurrentPage(tab);
  const safeTabId = encodeURIComponent(tab.id);
  return {
    name: `chlens-tab-${safeTabId}`,
    features: "popup,width=1180,height=820,resizable=yes",
    title: `${page.title || "タブ"} - read.crx 2`,
    shellClassName: "detached-tab-window",
    logLabel: "DetachedTab",
  };
}

/**
 * タブ本体を別窓へ移す共有ホスト。
 *
 * 変更理由: 別窓の生成・再利用・終了監視をタブメニューへ持たせると、同じタブを
 * 別経路から開いた時に窓が重複する。ここでtabId単位に一つのWindowProxyを管理し、
 * TabPanelだけをPortalすることで、タブ状態はTabStoreへ残したまま表示場所を移す。
 */
export const DetachedTabWindowProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { panes } = useTabPanes();
  const theme = useTheme();
  const [windows, setWindows] = useState<Map<string, DetachedTabWindowEntry>>(() => new Map());
  const windowsRef = useRef(windows);
  windowsRef.current = windows;

  const removeWindow = useCallback((tabId: string, expectedWindow?: Window) => {
    const current = windowsRef.current;
    const entry = current.get(tabId);
    if (!entry || (expectedWindow && entry.window !== expectedWindow)) {
      return;
    }

    const next = new Map(current);
    next.delete(tabId);
    windowsRef.current = next;
    setWindows(next);
  }, []);

  const openTab = useCallback(
    (tabId: string) => {
      const located = findTab(panes, tabId);
      if (!located || !isDetachablePage(getCurrentPage(located.tab))) {
        return false;
      }

      const existing = windowsRef.current.get(tabId);
      if (existing && !existing.window.closed) {
        existing.window.focus();
        return true;
      }

      if (existing) {
        existing.window.removeEventListener("beforeunload", existing.onBeforeUnload);
        removeWindow(tabId, existing.window);
      }

      // WindowProxyの生成はクリックイベントの同期処理で行い、ポップアップブロックを
      // 避ける。ReactのsetState updater内で開くとStrictMode等で副作用が二重実行される。
      const opened = openDetachedWindow(createDetachedTabOptions(located.tab));
      if (!opened) {
        return false;
      }

      const entry: DetachedTabWindowEntry = {
        ...opened,
        tabId,
        onBeforeUnload: () => removeWindow(tabId, opened.window),
      };
      opened.window.addEventListener("beforeunload", entry.onBeforeUnload, { once: true });
      const next = new Map(windowsRef.current);
      next.set(tabId, entry);
      windowsRef.current = next;
      setWindows(next);
      opened.window.focus();
      return true;
    },
    [panes, removeWindow],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const entry = windowsRef.current.get(tabId);
      if (!entry) {
        return;
      }

      entry.window.removeEventListener("beforeunload", entry.onBeforeUnload);
      if (!entry.window.closed) {
        entry.window.close();
      }
      removeWindow(tabId, entry.window);
    },
    [removeWindow],
  );

  const focusTab = useCallback((tabId: string) => {
    const entry = windowsRef.current.get(tabId);
    if (entry && !entry.window.closed) {
      entry.window.focus();
    }
  }, []);

  const isDetached = useCallback(
    (tabId: string) => {
      const entry = windows.get(tabId);
      return entry != null && !entry.window.closed;
    },
    [windows],
  );

  const toggleTab = useCallback(
    (tabId: string) => {
      if (isDetached(tabId)) {
        closeTab(tabId);
        return true;
      } else {
        return openTab(tabId);
      }
    },
    [closeTab, isDetached, openTab],
  );

  // タブを閉じる／復元する操作と別窓のライフサイクルを同期する。
  useEffect(() => {
    const availableTabIds = new Set(panes.flatMap((pane) => pane.tabs.map((tab) => tab.id)));
    for (const [tabId, entry] of windowsRef.current) {
      if (availableTabIds.has(tabId)) {
        continue;
      }
      entry.window.removeEventListener("beforeunload", entry.onBeforeUnload);
      if (!entry.window.closed) {
        entry.window.close();
      }
      removeWindow(tabId, entry.window);
    }
  }, [panes, removeWindow]);

  // ナビゲーションでページタイトルが変わったら、別窓のタイトルも追従させる。
  useEffect(() => {
    for (const entry of windows.values()) {
      const located = findTab(panes, entry.tabId);
      if (!located || entry.window.closed) {
        continue;
      }
      const page = getCurrentPage(located.tab);
      entry.window.document.title = `${page.title || "タブ"} - read.crx 2`;
      entry.root.dataset.theme = theme;
    }
  }, [panes, theme, windows]);

  useEffect(() => {
    return () => {
      for (const entry of windowsRef.current.values()) {
        entry.window.removeEventListener("beforeunload", entry.onBeforeUnload);
        if (!entry.window.closed) {
          entry.window.close();
        }
      }
    };
  }, []);

  const contextValue = useMemo<DetachedTabWindowContextValue>(
    () => ({ isDetached, openTab, closeTab, focusTab, toggleTab }),
    [closeTab, focusTab, isDetached, openTab, toggleTab],
  );

  return (
    <DetachedTabWindowContext.Provider value={contextValue}>
      {children}
      {[...windows.values()].map((entry) => {
        const located = findTab(panes, entry.tabId);
        if (!located || entry.window.closed) {
          return null;
        }

        const viewSurface: ViewSurface = {
          window: entry.window,
          document: entry.window.document,
        };
        return createPortal(
          <PaneProvider paneId={located.paneId}>
            <StatusBarProvider>
              <PageCountStatusProvider>
                <NgStatusProvider>
                  <AutoScrollStateProvider>
                    <DetachedTabSurface surface={viewSurface}>
                      {/* 別窓内の返信・別窓生成失敗などの通知を、表示中の窓へ出す。 */}
                      <ToastProvider topOffset="16px" rightOffset="16px" />
                      <DetachedTabToolbar tab={located.tab} onClose={() => closeTab(entry.tabId)} />
                      <div className="content-area">
                        <TabPanel
                          tab={located.tab}
                          isActive
                          isOverlayTarget={false}
                          viewSurface={viewSurface}
                        />
                      </div>
                    </DetachedTabSurface>
                  </AutoScrollStateProvider>
                </NgStatusProvider>
              </PageCountStatusProvider>
            </StatusBarProvider>
          </PaneProvider>,
          entry.root,
          entry.tabId,
        );
      })}
    </DetachedTabWindowContext.Provider>
  );
};

const DetachedTabToolbar: React.FC<{ tab: Tab; onClose: () => void }> = ({ tab, onClose }) => {
  const dispatch = useTabDispatchForTab(tab.id);
  const page = getCurrentPage(tab);

  return (
    <header className="detached-tab-toolbar">
      <strong className="detached-tab-toolbar__title">{page.title || "タブ"}</strong>
      <div className="detached-tab-toolbar__actions">
        <button
          type="button"
          disabled={!canGoBack(tab)}
          onClick={() => dispatch({ type: "GO_BACK" })}
          title="前のページ"
        >
          戻る
        </button>
        <button
          type="button"
          disabled={!canGoForward(tab)}
          onClick={() => dispatch({ type: "GO_FORWARD" })}
          title="次のページ"
        >
          進む
        </button>
        <button type="button" onClick={() => dispatch({ type: "RELOAD" })} title="再読み込み">
          更新
        </button>
        <button type="button" onClick={onClose} title="メイン画面へ戻す">
          戻す
        </button>
      </div>
    </header>
  );
};

const DetachedTabSurface: React.FC<{
  surface: ViewSurface;
  children: ReactNode;
}> = ({ surface, children }) => {
  // 窓ごとに同一のsurfaceオブジェクトを渡し、ページ内のイベント購読を不要に解除しない。
  const { document: surfaceDocument, window: surfaceWindow } = surface;
  const stableSurface = useMemo(
    () => ({ document: surfaceDocument, window: surfaceWindow }),
    [surfaceDocument, surfaceWindow],
  );
  return <ViewSurfaceProvider surface={stableSurface}>{children}</ViewSurfaceProvider>;
};
