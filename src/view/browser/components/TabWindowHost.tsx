import { PenLine } from "lucide-react";
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AutoRefreshStatusItem } from "src/view/browser/components/AutoRefreshStatusItem";
import { CommentOverlayStatusItem } from "src/view/browser/components/CommentOverlayStatusItem";
import { IkioiStatusItem } from "src/view/browser/components/IkioiStatusItem";
import { NgStatusItem } from "src/view/browser/components/NgStatusItem";
import { PageCountStatusItem } from "src/view/browser/components/PageCountStatusItem";
import { PopularFilterStatusItem } from "src/view/browser/components/PopularFilterStatusItem";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBar, StatusBarItem, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { TabPanel } from "src/view/browser/components/TabView";
import { TitleBar } from "src/view/browser/components/TitleBar";
import { WindowNavigationBridge } from "src/view/browser/components/WindowNavigationBridge";
import { createAuxiliaryWindowRoot } from "src/view/browser/hooks/auxiliary-window-root";
import {
  type DetachedTabController,
  DetachedTabControllerContext,
} from "src/view/browser/hooks/detached-tab-controller";
import { tabActions } from "src/view/browser/hooks/tab-store-actions";
import { AutoScrollStateProvider } from "src/view/browser/hooks/use-auto-scroll-state";
import {
  type AuxiliaryWindowHandle,
  type AuxiliaryWindowOptions,
  openAuxiliaryWindow,
} from "src/view/browser/hooks/use-auxiliary-window";
import { NgStatusProvider } from "src/view/browser/hooks/use-ng-status";
import { PageCountStatusProvider } from "src/view/browser/hooks/use-page-count-status";
import {
  PaneProvider,
  useTabDispatch,
  useTabDispatchForTab,
  useTabPanes,
  useTabStore,
} from "src/view/browser/hooks/use-tab-store";
import { TabViewScopeProvider } from "src/view/browser/hooks/use-tab-view-scope";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { type ViewSurface, ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { useWriteSession } from "src/view/browser/hooks/use-write-session";
import {
  canGoBack,
  canGoForward,
  getCurrentPage,
  type Page,
  type Pane,
  type Tab,
} from "src/view/browser/types";
import { ToastProvider } from "src/view/browser/ui/Toast";

interface TabWindowEntry extends AuxiliaryWindowHandle {
  tabId: string;
  onBeforeUnload: () => void;
  onLoad: () => void;
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

function createTabWindowOptions(tab: Tab): AuxiliaryWindowOptions {
  const page = getCurrentPage(tab);
  const safeTabId = encodeURIComponent(tab.id);
  return {
    name: `chlens-tab-${safeTabId}`,
    features: "popup,width=1180,height=820,resizable=yes",
    title: `${page.title || "タブ"} - read.crx 2`,
    shellClassName: "detached-tab-window",
    logLabel: "TabWindow",
  };
}

/**
 * タブ本体を別窓へ移す共有ホスト。
 *
 * 変更理由: 別窓の生成・再利用・終了監視をタブメニューへ持たせると、同じタブを
 * 別経路から開いた時に窓が重複する。ここでtabId単位に一つのWindowProxyを管理し、
 * TabPanelだけをPortalすることで、タブ状態はTabStoreへ残したまま表示場所を移す。
 */
export const TabWindowHost: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { panes } = useTabPanes();
  const { stateRef } = useTabStore();
  const dispatch = useTabDispatch();
  const theme = useTheme();
  const [windows, setWindows] = useState<Map<string, TabWindowEntry>>(() => new Map());
  const windowsRef = useRef(windows);
  const closeDetachedTabRef = useRef<(tabId: string) => void>(() => {});
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

  const detachTab = useCallback(
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
        existing.window.removeEventListener("load", existing.onLoad);
        removeWindow(tabId, existing.window);
      }

      // WindowProxyの生成はクリックイベントの同期処理で行い、ポップアップブロックを
      // 避ける。ReactのsetState updater内で開くとStrictMode等で副作用が二重実行される。
      const opened = openAuxiliaryWindow(createTabWindowOptions(located.tab));
      if (!opened) {
        return false;
      }

      const entry: TabWindowEntry = {
        ...opened,
        tabId,
        // beforeunload直後はreloadでも発火するため、closedを確認できた時だけタブを終了する。
        // OSの×では親窓の監視も併用し、再読み込みでタブを誤って消さないようにする。
        onBeforeUnload: () => {
          const current = windowsRef.current.get(tabId);
          if (current?.window !== opened.window || !opened.window.closed) {
            return;
          }
          closeDetachedTabRef.current(tabId);
        },
        onLoad: () => {
          const current = windowsRef.current.get(tabId);
          if (!current || current.window !== opened.window || opened.window.closed) {
            return;
          }
          const currentLocation = findTab(stateRef.current.panes, tabId);
          if (!currentLocation) {
            return;
          }
          try {
            // popupの再読み込みではPortal先のDOMも破棄されるため、同じWindowProxyへ
            // rootとスタイルを再接続し、タブを元窓へ勝手に戻さない。
            const root = createAuxiliaryWindowRoot(
              document,
              opened.window,
              createTabWindowOptions(currentLocation.tab),
            );
            const next = new Map(windowsRef.current);
            const latest = next.get(tabId);
            if (!latest || latest.window !== opened.window) {
              return;
            }
            next.set(tabId, { ...latest, root });
            windowsRef.current = next;
            setWindows(next);
          } catch (error) {
            console.error("[DetachedTab] 再読み込み後の別窓を再接続できませんでした", error);
          }
        },
      };
      opened.window.addEventListener("beforeunload", entry.onBeforeUnload, { once: true });
      opened.window.addEventListener("load", entry.onLoad);
      const next = new Map(windowsRef.current);
      next.set(tabId, entry);
      windowsRef.current = next;
      setWindows(next);

      const locatedPane = panes.find((pane) => pane.id === located.paneId);
      if (locatedPane?.activeTabId === tabId) {
        const fallbackTab = locatedPane.tabs.find((candidate) => {
          const candidateWindow = windowsRef.current.get(candidate.id)?.window;
          return candidate.id !== tabId && (!candidateWindow || candidateWindow.closed);
        });
        if (fallbackTab) {
          // 切り離し中のタブを本窓のactiveTabに残すと、タブバーから消えた後に
          // 本文と戻る/進む入力だけが別窓へ誤配送されるため、表示可能なタブへ移す。
          dispatch({
            ...tabActions.selectTab(fallbackTab.id, { preserveActivePane: true }),
            paneId: located.paneId,
          });
        } else {
          // ペイン内の最後の表示タブを切り離しても、本窓の操作対象を不可視タブへ
          // 残さない。元ページを引き継ぐ新規タブを表示用に作り、別窓の所有権を保つ。
          dispatch({
            ...tabActions.addTab({ preserveActivePane: true }),
            paneId: located.paneId,
          });
        }
      }
      opened.window.focus();
      return true;
    },
    [dispatch, panes, removeWindow, stateRef],
  );

  const reattachTab = useCallback(
    (tabId: string) => {
      const entry = windowsRef.current.get(tabId);
      if (!entry) {
        return;
      }

      entry.window.removeEventListener("beforeunload", entry.onBeforeUnload);
      entry.window.removeEventListener("load", entry.onLoad);
      if (!entry.window.closed) {
        entry.window.close();
      }
      removeWindow(tabId, entry.window);

      const located = findTab(stateRef.current.panes, tabId);
      if (located) {
        // 明示的な「戻す」だけはタブを保持し、元ペインで選択された状態に戻す。
        dispatch({ ...tabActions.selectTab(tabId), paneId: located.paneId });
      }
    },
    [dispatch, removeWindow, stateRef],
  );

  const closeDetachedTab = useCallback(
    (tabId: string) => {
      const entry = windowsRef.current.get(tabId);
      if (!entry) {
        return;
      }

      const currentPanes = stateRef.current.panes;
      const located = findTab(currentPanes, tabId);
      const pane = located && currentPanes.find((candidate) => candidate.id === located.paneId);
      if (!located || located.tab.pinned || !pane) {
        // TabStoreの固定タブ保護を破らず、操作不能な不可視タブを残さないため、
        // 構造上閉じられない場合は明示的な復帰へフォールバックする。
        console.warn("[DetachedTab] このタブは別窓から終了できないため元画面へ戻します", tabId);
        reattachTab(tabId);
        return;
      }

      // 先に監視を外してからCLOSE_TABを送ることで、プログラム終了をOS終了として
      // 二重処理せず、閉じたタブ履歴にも一度だけ記録する。
      entry.window.removeEventListener("beforeunload", entry.onBeforeUnload);
      entry.window.removeEventListener("load", entry.onLoad);
      if (!entry.window.closed) {
        entry.window.close();
      }
      removeWindow(tabId, entry.window);
      dispatch({
        ...tabActions.closeTab(tabId, {
          preserveActivePane: true,
          replaceLastTab: true,
        }),
        paneId: located.paneId,
      });
    },
    [dispatch, reattachTab, removeWindow, stateRef],
  );
  closeDetachedTabRef.current = closeDetachedTab;

  const focusTabWindow = useCallback((tabId: string) => {
    const entry = windowsRef.current.get(tabId);
    if (entry && !entry.window.closed) {
      entry.window.focus();
    }
  }, []);

  const isDetachedTab = useCallback(
    (tabId: string) => {
      // closed=trueを検知してからCLOSE_TABを確定するまでの間も、レジストリ上は
      // 切り離し中として扱う。監視周期の隙間で本窓へ一瞬だけ戻る表示を防ぐ。
      return windows.has(tabId);
    },
    [windows],
  );

  const handleClosedWindow = useCallback(
    (tabId: string, expectedWindow: Window) => {
      const entry = windowsRef.current.get(tabId);
      if (!entry || entry.window !== expectedWindow || !expectedWindow.closed) {
        return;
      }

      // beforeunloadはreloadでも発火するので、closedを親窓から確認できた場合だけ
      // タブを終了する。entry identityも照合し、同じtabIdの再オープンを誤って閉じない。
      closeDetachedTab(tabId);
    },
    [closeDetachedTab],
  );

  useEffect(() => {
    // WindowProxyのbeforeunload通知はブラウザ実装差があるため、親窓からclosedを
    // 定期確認する。再読み込みではclosed=falseのままなのでタブを失わない。
    const monitorId = window.setInterval(() => {
      for (const [tabId, entry] of windowsRef.current) {
        handleClosedWindow(tabId, entry.window);
      }
    }, 250);
    return () => window.clearInterval(monitorId);
  }, [handleClosedWindow]);

  useEffect(() => {
    for (const pane of panes) {
      const activeTab = pane.tabs.find((tab) => tab.id === pane.activeTabId);
      const activeWindow = activeTab && windowsRef.current.get(activeTab.id);
      if (!activeTab || !activeWindow || activeWindow.window.closed) {
        continue;
      }

      const fallbackTab = pane.tabs.find((tab) => {
        const entry = windowsRef.current.get(tab.id);
        return !entry || entry.window.closed;
      });
      if (fallbackTab) {
        // 本窓側の閉じる操作でactiveTabが別窓タブへ移った場合も、不可視タブを
        // ナビゲーションやステータスの暗黙の対象に残さない。
        dispatch({
          ...tabActions.selectTab(fallbackTab.id, { preserveActivePane: true }),
          paneId: pane.id,
        });
      } else {
        // 全タブが別窓へ移っているペインには、本窓で操作できるタブを一つ補う。
        dispatch({ ...tabActions.addTab({ preserveActivePane: true }), paneId: pane.id });
      }
    }
  }, [dispatch, panes, windows]);

  // タブを閉じる／復元する操作と別窓のライフサイクルを同期する。
  useEffect(() => {
    const availableTabIds = new Set(panes.flatMap((pane) => pane.tabs.map((tab) => tab.id)));
    for (const [tabId, entry] of windowsRef.current) {
      if (availableTabIds.has(tabId)) {
        continue;
      }
      entry.window.removeEventListener("beforeunload", entry.onBeforeUnload);
      entry.window.removeEventListener("load", entry.onLoad);
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
        entry.window.removeEventListener("load", entry.onLoad);
        if (!entry.window.closed) {
          entry.window.close();
        }
      }
    };
  }, []);

  const contextValue = useMemo<DetachedTabController>(
    () => ({ isDetachedTab, detachTab, reattachTab, closeDetachedTab, focusTabWindow }),
    [closeDetachedTab, detachTab, focusTabWindow, isDetachedTab, reattachTab],
  );

  return (
    <DetachedTabControllerContext.Provider value={contextValue}>
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
          <TabViewScopeProvider scope={{ paneId: located.paneId, tabId: located.tab.id }}>
            <PaneProvider paneId={located.paneId}>
              <StatusBarProvider>
                <PageCountStatusProvider>
                  <NgStatusProvider>
                    <AutoScrollStateProvider>
                      <TabWindowSurface surface={viewSurface}>
                        <WindowNavigationBridge
                          tabId={located.tab.id}
                          manageBrowserHistory={false}
                        />
                        {/* 別窓内の返信・別窓生成失敗などの通知を、表示中の窓へ出す。 */}
                        <ToastProvider topOffset="16px" rightOffset="16px" />
                        {/* 表示タブをContextで固定し、元ペインの選択変更に影響されない共通タイトルを出す。 */}
                        <TitleBar showNavigationButtons={false} />
                        <TabWindowToolbar
                          tab={located.tab}
                          onReattach={() => reattachTab(entry.tabId)}
                          onClose={() => closeDetachedTab(entry.tabId)}
                        />
                        <div className="content-area">
                          <TabPanel
                            tab={located.tab}
                            isActive
                            isOverlayTarget={false}
                            viewSurface={viewSurface}
                          />
                        </div>
                        <NgStatusItem />
                        <IkioiStatusItem />
                        <PopularFilterStatusItem />
                        <AutoRefreshStatusItem />
                        <CommentOverlayStatusItem isActive />
                        <PageCountStatusItem />
                        <TabWindowWriteStatusItem />
                        <StatusBar />
                      </TabWindowSurface>
                    </AutoScrollStateProvider>
                  </NgStatusProvider>
                </PageCountStatusProvider>
              </StatusBarProvider>
            </PaneProvider>
          </TabViewScopeProvider>,
          entry.root,
          entry.tabId,
        );
      })}
    </DetachedTabControllerContext.Provider>
  );
};

const TabWindowToolbar: React.FC<{
  tab: Tab;
  onReattach: () => void;
  onClose: () => void;
}> = ({ tab, onReattach, onClose }) => {
  const dispatch = useTabDispatchForTab(tab.id);

  return (
    <nav className="detached-tab-toolbar" aria-label="別窓のタブ操作">
      <span className="detached-tab-toolbar__title">別窓表示</span>
      <div className="detached-tab-toolbar__actions">
        <button
          type="button"
          disabled={!canGoBack(tab)}
          onClick={() => dispatch(tabActions.goBack())}
          title="前のページ"
        >
          戻る
        </button>
        <button
          type="button"
          disabled={!canGoForward(tab)}
          onClick={() => dispatch(tabActions.goForward())}
          title="次のページ"
        >
          進む
        </button>
        <button type="button" onClick={() => dispatch(tabActions.reload())} title="再読み込み">
          更新
        </button>
        <button type="button" onClick={onReattach} title="メイン画面へ戻す">
          戻す
        </button>
        <button type="button" onClick={onClose} title="タブと別窓を閉じる">
          閉じる
        </button>
      </div>
    </nav>
  );
};

const TabWindowWriteStatusItem: React.FC = () => {
  const { viewPage } = useTabStore();
  const { openWriteWindow, selectThread } = useWriteSession();

  if (viewPage.type !== "thread") {
    return null;
  }

  return (
    <StatusBarItem
      id="detached-write-window-toggle"
      alignment="right"
      priority={STATUS_BAR_PRIORITY.right.writePanelToggle}
      interactive
      title="書き込み窓を開く"
    >
      <button
        type="button"
        className="status-bar__btn"
        onClick={() => {
          // 別窓では下部パネルを開かず、常に共有の書き込み窓へ表示中スレを渡す。
          selectThread(viewPage.threadUrl);
          openWriteWindow();
        }}
        aria-label="書き込み窓を開く"
      >
        <PenLine size={12} />
        <span>書き込み</span>
      </button>
    </StatusBarItem>
  );
};

const TabWindowSurface: React.FC<{
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
