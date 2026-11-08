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
import { createLogger } from "src/app/logger";
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
  type TabDropResult,
} from "src/features/tabs/browser/detached-tab-controller";
import { useTabBarOrientation } from "src/features/tabs/browser/use-tab-bar-orientation";
import {
  getNewWindowOrigin,
  getWindowScreenRect,
  isBeforeTabCenter,
  isPointInRect,
  screenToClientPoint,
} from "src/features/tabs/browser/window-drop-target";
import { WindowNavigationBridge } from "src/features/tabs/ui/WindowNavigationBridge";
import { useZenMode } from "src/view/browser/commands/zen-mode-store";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { WindowShell } from "src/view/browser/shell/WindowShell";
import { getWindowPanes, MAX_PANES } from "src/view/browser/state/tabs/tab-store-selectors";
import type { TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import {
  useAllPanes,
  useTabDispatch,
  useTabStore,
} from "src/view/browser/state/tabs/use-tab-store";
import { WindowScopeProvider } from "src/view/browser/state/tabs/use-window-scope";
import { MAIN_WINDOW_ID } from "src/view/browser/state/tabs/window-model";
import { getCurrentPage, type Pane, type Tab } from "src/view/browser/types";
import { ToastProvider } from "src/view/browser/ui/Toast";

const logger = createLogger("view/browser");

/** 位置と大きさを保存できる形に読み取る。最小化中などで読めない場合は null を返す。 */
function readWindowBounds(
  win: Window,
): { left: number; top: number; width: number; height: number } | null {
  const { screenX, screenY, outerWidth, outerHeight } = win;
  if (![screenX, screenY, outerWidth, outerHeight].every(Number.isFinite)) return null;
  // 最小化中のWindowsは (-32000, -32000) 付近の位置を返すため、保存すると復元位置が壊れる。
  if (outerWidth <= 0 || outerHeight <= 0 || screenX <= -30000 || screenY <= -30000) return null;
  return { left: screenX, top: screenY, width: outerWidth, height: outerHeight };
}

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

type ExistingDrop = {
  window: Window;
  windowId: string;
  pane: Pane;
  element: HTMLElement;
  kind: "split-left" | "split-right" | "insert" | "append";
  index: number;
};

/** プレビューと確定で同じドロップ先を使う。 */
function resolveExistingDrop(
  state: TabStoreState,
  candidates: { id: string; window: Window }[],
  origin: Window,
  tabId: string,
  screenX: number,
  screenY: number,
  clientPoint?: { x: number; y: number },
): ExistingDrop | null {
  const source = locate(state.panes, tabId);
  if (!source) return null;
  // 操作元のclient座標は外枠の推定値より正確で、最大化やブラウザのUIの影響を受けない。
  const inOrigin = clientPoint
    ? clientPoint.x >= 0 &&
      clientPoint.x < origin.innerWidth &&
      clientPoint.y >= 0 &&
      clientPoint.y < origin.innerHeight
    : isPointInRect(getWindowScreenRect(origin), screenX, screenY);
  const target = candidates.find(
    (candidate) =>
      (inOrigin ? candidate.window === origin : candidate.window !== origin) &&
      (candidate.window === origin && clientPoint
        ? inOrigin
        : isPointInRect(getWindowScreenRect(candidate.window), screenX, screenY)),
  );
  if (!target) return null;
  const point =
    target.window === origin && clientPoint
      ? clientPoint
      : screenToClientPoint(target.window, screenX, screenY);
  // ドラッグ中のタブ自身がポインタの下を覆っても、その背後の移動先を判定する。
  const doc = target.window.document;
  const hits = doc.elementsFromPoint?.(point.x, point.y) ?? [
    doc.elementFromPoint(point.x, point.y),
  ];
  const hit =
    hits.find(
      (element) => element?.closest<HTMLElement>("[data-tab-id]")?.dataset.tabId !== tabId,
    ) ?? null;
  const tabElement = hit?.closest<HTMLElement>("[data-tab-id]");
  const hovered = tabElement?.dataset.tabId
    ? locate(state.panes, tabElement.dataset.tabId)
    : undefined;
  if (tabElement && hovered && (hovered.pane.windowId ?? MAIN_WINDOW_ID) === target.id) {
    if (hovered.pane.id === source.pane.id) return null;
    const before = isBeforeTabCenter(
      tabElement.getBoundingClientRect(),
      point,
      Boolean(tabElement.closest(".tab-bar--vertical")),
    );
    return {
      window: target.window,
      windowId: target.id,
      pane: hovered.pane,
      element: tabElement,
      kind: "insert",
      index: hovered.pane.tabs.indexOf(hovered.tab) + (before ? 0 : 1),
    };
  }
  let paneElement = hit?.closest<HTMLElement>("[data-workspace-pane-id]") ?? null;
  let pane = state.panes.find(
    (item) =>
      item.id === paneElement?.dataset.workspacePaneId &&
      (item.windowId ?? MAIN_WINDOW_ID) === target.id,
  );
  // 別窓の枠や共通バーに落とした場合は、従来どおり選択中ペインへ追加する。
  if ((!pane || !paneElement) && target.window !== origin) {
    const activePaneId = state.windows.find((item) => item.id === target.id)?.activePaneId;
    pane = state.panes.find((item) => item.id === activePaneId);
    if (!pane || pane.id === source.pane.id) return null;
    paneElement =
      [...target.window.document.querySelectorAll<HTMLElement>("[data-workspace-pane-id]")].find(
        (element) => element.dataset.workspacePaneId === pane?.id,
      ) ?? target.window.document.body;
    return {
      window: target.window,
      windowId: target.id,
      pane,
      element: paneElement,
      kind: "append",
      index: pane.tabs.length,
    };
  }
  if (!pane || !paneElement) return null;
  const rect = paneElement.getBoundingClientRect();
  const fraction = (point.x - rect.left) / rect.width;
  if (getWindowPanes(state, target.id).length < MAX_PANES && (fraction < 0.2 || fraction > 0.8)) {
    return {
      window: target.window,
      windowId: target.id,
      pane,
      element: paneElement,
      kind: fraction < 0.2 ? "split-left" : "split-right",
      index: 0,
    };
  }
  if (pane.id === source.pane.id) return null;
  return {
    window: target.window,
    windowId: target.id,
    pane,
    element: paneElement,
    kind: "append",
    index: pane.tabs.length,
  };
}
function optionsFor(
  tab: Tab,
  windowId: string,
  bounds?: { left: number; top: number; width?: number; height?: number },
): AuxiliaryWindowOptions {
  return {
    // 元のタブが別の窓へ移動しても、名前付き窓の再利用先が衝突しないようにする。
    name: `chlens-window-${encodeURIComponent(windowId)}`,
    features: `popup,width=${bounds?.width ?? 1180},height=${bounds?.height ?? 820},resizable=yes${
      bounds ? `,left=${bounds.left},top=${bounds.top}` : ""
    }`,
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
  const previewRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<(id: string) => void>(() => {});
  // 変更理由: 監視の効果は窓の寿命と同じにするため、変わりうる値は参照から読む。
  const dispatchRef = useRef(dispatch);
  useLayoutEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
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
  /** 開いた窓を寿命の管理対象にし、閉じる・再読み込みを監視する。 */
  const registerWindow = useCallback(
    (id: string, opened: AuxiliaryWindowHandle) => {
      const watcher = watchAuxiliaryWindow({
        window: opened.window,
        sourceDocument: document,
        isCurrent: () => entriesRef.current.get(id)?.window === opened.window,
        getReconnectOptions: () => {
          const pane = stateRef.current.panes.find((item) => item.windowId === id);
          const tab = pane?.tabs.find((item) => item.id === pane.activeTabId);
          return tab ? optionsFor(tab, id, readWindowBounds(opened.window) ?? undefined) : null;
        },
        onClosed: () => closeRef.current(id),
        onReconnect: (root) => {
          const entry = entriesRef.current.get(id);
          if (entry?.window === opened.window) setEntry(id, { ...entry, root });
        },
      });
      setEntry(id, { ...opened, id, watcher });
    },
    [setEntry, stateRef],
  );
  const openWindowForTab = useCallback(
    (tabId: string, origin?: { left: number; top: number }, reuseOwnWindow = true) => {
      const found = locate(stateRef.current.panes, tabId);
      if (!found) return false;
      const existing = entriesRef.current.get(found.pane.windowId ?? MAIN_WINDOW_ID);
      if (reuseOwnWindow && existing && !existing.window.closed) {
        existing.window.focus();
        return true;
      }
      const id = crypto.randomUUID();
      const opened = openAuxiliaryWindow(optionsFor(found.tab, id, origin));
      if (!opened) return false;
      const paneId = crypto.randomUUID();
      registerWindow(id, opened);
      dispatch({ type: "TRANSFER_TAB", tabId, to: { newWindowId: id, newPaneId: paneId } });
      opened.window.focus();
      return true;
    },
    [dispatch, registerWindow, stateRef],
  );
  const detachTab = useCallback((tabId: string) => openWindowForTab(tabId), [openWindowForTab]);
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
  const clearTabDropPreview = useCallback(() => {
    previewRef.current?.remove();
    previewRef.current = null;
  }, []);
  const resolveDrop = useCallback(
    (
      tabId: string,
      screenX: number,
      screenY: number,
      originWindow: Window,
      clientPoint?: { x: number; y: number },
    ) => {
      const candidates = [
        ...[...entriesRef.current.values()]
          .filter((entry) => !entry.window.closed)
          .reverse()
          .map((entry) => ({ id: entry.id, window: entry.window })),
        { id: MAIN_WINDOW_ID, window },
      ];
      return resolveExistingDrop(
        stateRef.current,
        candidates,
        originWindow,
        tabId,
        screenX,
        screenY,
        clientPoint,
      );
    },
    [stateRef],
  );
  const previewTabDrop = useCallback(
    (
      tabId: string,
      screenX: number,
      screenY: number,
      originWindow: Window,
      clientPoint?: { x: number; y: number },
    ) => {
      clearTabDropPreview();
      const target = resolveDrop(tabId, screenX, screenY, originWindow, clientPoint);
      if (!target) return;
      const rect = target.element.getBoundingClientRect();
      const preview = target.window.document.createElement("div");
      preview.className = "workspace-tab-drop-preview";
      if (target.kind === "insert") {
        const point =
          target.window === originWindow && clientPoint
            ? clientPoint
            : screenToClientPoint(target.window, screenX, screenY);
        const vertical = Boolean(target.element.closest(".tab-bar--vertical"));
        const before = isBeforeTabCenter(rect, point, vertical);
        preview.classList.add(
          vertical
            ? "workspace-tab-drop-preview--horizontal"
            : "workspace-tab-drop-preview--vertical",
        );
        preview.style.left = `${vertical ? rect.left : before ? rect.left : rect.right}px`;
        preview.style.top = `${vertical ? (before ? rect.top : rect.bottom) : rect.top}px`;
        if (vertical) preview.style.width = `${rect.width}px`;
        else preview.style.height = `${rect.height}px`;
      } else {
        const split = target.kind === "split-left" || target.kind === "split-right";
        preview.style.left = `${rect.left + (target.kind === "split-right" ? rect.width / 2 : 0)}px`;
        preview.style.top = `${rect.top}px`;
        preview.style.width = `${split ? rect.width / 2 : rect.width}px`;
        preview.style.height = `${rect.height}px`;
      }
      (target.element.closest("[data-theme]") ?? target.window.document.body).appendChild(preview);
      previewRef.current = preview;
    },
    [clearTabDropPreview, resolveDrop],
  );
  useEffect(() => clearTabDropPreview, [clearTabDropPreview]);
  const dropTabAtScreenPoint = useCallback(
    (
      tabId: string,
      screenX: number,
      screenY: number,
      originWindow: Window,
      clientPoint?: { x: number; y: number },
    ): TabDropResult => {
      const state = stateRef.current;
      const found = locate(state.panes, tabId);
      if (!found) return "ignored";
      const target = resolveDrop(tabId, screenX, screenY, originWindow, clientPoint);
      if (target) {
        const to =
          target.kind === "split-left" || target.kind === "split-right"
            ? {
                windowId: target.windowId,
                splitPaneId: target.pane.id,
                newPaneId: crypto.randomUUID(),
                side: target.kind === "split-left" ? ("left" as const) : ("right" as const),
              }
            : { windowId: target.windowId, paneId: target.pane.id, index: target.index };
        dispatch({ type: "TRANSFER_TAB", tabId, to });
        target.window.focus();
        return "moved";
      }
      // 既存の窓の内部では並べ替えを優先し、新しい窓を開かない。
      const windows = [window, ...[...entriesRef.current.values()].map((entry) => entry.window)];
      if (
        windows.some(
          (candidate) =>
            !candidate.closed && isPointInRect(getWindowScreenRect(candidate), screenX, screenY),
        )
      )
        return "ignored";
      const sourceWindowId = found.pane.windowId ?? MAIN_WINDOW_ID;
      const sourceTabCount = state.panes
        .filter((pane) => (pane.windowId ?? MAIN_WINDOW_ID) === sourceWindowId)
        .reduce((count, pane) => count + pane.tabs.length, 0);
      if (sourceWindowId !== MAIN_WINDOW_ID && sourceTabCount === 1) return "ignored";
      const opened = openWindowForTab(tabId, getNewWindowOrigin(screenX, screenY), false);
      return opened ? "opened" : "failed";
    },
    [dispatch, openWindowForTab, resolveDrop, stateRef],
  );
  const context = useMemo<DetachedTabController>(
    () => ({
      detachTab,
      reattachTab,
      focusTabWindow,
      closeDetachedTab,
      dropTabAtScreenPoint,
      previewTabDrop,
      clearTabDropPreview,
    }),
    [
      detachTab,
      reattachTab,
      focusTabWindow,
      closeDetachedTab,
      dropTabAtScreenPoint,
      previewTabDrop,
      clearTabDropPreview,
    ],
  );
  useEffect(() => {
    // 変更理由: セッションから読み込んだ別窓を、起動時に同じ構成で開き直す。
    // 窓を開けない環境（ポップアップのブロックなど）では、タブを失わないよう本窓へ集める。
    for (const windowState of stateRef.current.windows) {
      if (windowState.kind !== "aux" || entriesRef.current.has(windowState.id)) continue;
      const windowPanes = stateRef.current.panes.filter(
        (pane) => (pane.windowId ?? MAIN_WINDOW_ID) === windowState.id,
      );
      const pane =
        windowPanes.find((item) => item.id === windowState.activePaneId) ?? windowPanes[0];
      const tab = pane?.tabs.find((item) => item.id === pane.activeTabId) ?? pane?.tabs[0];
      const opened = tab
        ? openAuxiliaryWindow(optionsFor(tab, windowState.id, windowState.bounds))
        : null;
      if (opened) {
        registerWindow(windowState.id, opened);
      } else {
        logger.error(`[WindowHost] 別窓を復元できなかったため本窓へ集めます: ${windowState.id}`);
        dispatch({ type: "COLLAPSE_WORKSPACE_WINDOW", windowId: windowState.id });
      }
    }
    // 起動時の1回だけ実行する。以後の窓の増減は利用者の操作で扱う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onPageHide = () => {
      parentClosing.current = true;
    };
    window.addEventListener("pagehide", onPageHide, { capture: true });
    const monitor = window.setInterval(() => {
      for (const [id, entry] of entriesRef.current) {
        if (entry.window.closed) {
          closeRef.current(id);
          continue;
        }
        // 変更理由: 窓の移動と大きさの変更にはイベントがないため、定期監視で保存対象へ反映する。
        const bounds = readWindowBounds(entry.window);
        const saved = stateRef.current.windows.find((item) => item.id === id)?.bounds;
        if (
          bounds &&
          (saved?.left !== bounds.left ||
            saved?.top !== bounds.top ||
            saved?.width !== bounds.width ||
            saved?.height !== bounds.height)
        ) {
          dispatchRef.current({ type: "SET_WORKSPACE_WINDOW_BOUNDS", windowId: id, bounds });
        }
      }
    }, 250);
    return () => {
      window.removeEventListener("pagehide", onPageHide, { capture: true });
      window.clearInterval(monitor);
      for (const entry of entriesRef.current.values()) entry.watcher.release();
    };
    // stateRef は安定した参照のため、窓の監視は起動時の1回だけ設定する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
