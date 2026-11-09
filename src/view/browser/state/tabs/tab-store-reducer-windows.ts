import { getPaneWindowId, getWindowPanes } from "src/view/browser/state/tabs/tab-store-selectors";
import { pushClosed } from "src/view/browser/state/tabs/tab-store-state-helpers";
import type { ScopedTabActionOf } from "src/view/browser/state/tabs/tab-store-types";
import { type TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { MAIN_WINDOW_ID } from "src/view/browser/state/tabs/window-model";

/** 別窓（ワークスペースウィンドウ）の終了・本窓への集約・位置の記録の reducer。 */

export function closeWorkspaceWindow(
  state: TabStoreState,
  action: ScopedTabActionOf<"CLOSE_WORKSPACE_WINDOW">,
): TabStoreState {
  const target = state.windows.find(
    (window) => window.id === action.windowId && window.kind === "aux",
  );
  if (!target) return state;
  const removed = getWindowPanes(state, target.id);
  const panes = state.panes.filter((pane) => getPaneWindowId(pane) !== target.id);
  const main = state.windows.find((window) => window.id === MAIN_WINDOW_ID);
  const fallback =
    panes.find((pane) => pane.id === main?.activePaneId) ??
    panes.find((pane) => getPaneWindowId(pane) === MAIN_WINDOW_ID);
  if (!fallback) return state;
  // OSの終了では固定タブも含めて閉じた履歴へ残し、再度本窓から開けるようにする。
  const closedTabs = removed.flatMap((pane) => pane.tabs).reduce(pushClosed, state.closedTabs);
  const bottomPanels =
    state.bottomPanels &&
    Object.fromEntries(
      Object.entries(state.bottomPanels).filter(([id]) => panes.some((pane) => pane.id === id)),
    );
  return {
    ...state,
    panes,
    windows: state.windows.filter((window) => window.id !== target.id),
    activePaneId: removed.some((pane) => pane.id === state.activePaneId)
      ? fallback.id
      : state.activePaneId,
    closedTabs,
    ...(bottomPanels ? { bottomPanels } : {}),
  };
}

export function collapseWorkspaceWindow(
  state: TabStoreState,
  action: ScopedTabActionOf<"COLLAPSE_WORKSPACE_WINDOW">,
): TabStoreState {
  const target = state.windows.find(
    (window) => window.id === action.windowId && window.kind === "aux",
  );
  if (!target) return state;
  const removed = getWindowPanes(state, target.id);
  const main = state.windows.find((window) => window.id === MAIN_WINDOW_ID);
  const destination =
    state.panes.find((pane) => pane.id === main?.activePaneId) ??
    state.panes.find((pane) => getPaneWindowId(pane) === MAIN_WINDOW_ID);
  if (!destination) return state;
  // 変更理由: 窓を開けない環境でもタブを失わないよう、履歴へ積まずに本窓の末尾へ集める。
  const movedTabs = removed.flatMap((pane) => pane.tabs);
  const panes = state.panes
    .filter((pane) => getPaneWindowId(pane) !== target.id)
    .map((pane) =>
      pane.id === destination.id ? { ...pane, tabs: [...pane.tabs, ...movedTabs] } : pane,
    );
  const bottomPanels =
    state.bottomPanels &&
    Object.fromEntries(
      Object.entries(state.bottomPanels).filter(([id]) => panes.some((pane) => pane.id === id)),
    );
  return {
    ...state,
    panes,
    windows: state.windows.filter((window) => window.id !== target.id),
    activePaneId: removed.some((pane) => pane.id === state.activePaneId)
      ? destination.id
      : state.activePaneId,
    ...(bottomPanels ? { bottomPanels } : {}),
  };
}

export function setWorkspaceWindowBounds(
  state: TabStoreState,
  action: ScopedTabActionOf<"SET_WORKSPACE_WINDOW_BOUNDS">,
): TabStoreState {
  const target = state.windows.find((window) => window.id === action.windowId);
  const current = target?.bounds;
  if (
    !target ||
    (current &&
      current.left === action.bounds.left &&
      current.top === action.bounds.top &&
      current.width === action.bounds.width &&
      current.height === action.bounds.height)
  ) {
    return state;
  }
  return {
    ...state,
    windows: state.windows.map((window) =>
      window.id === target.id ? { ...window, bounds: action.bounds } : window,
    ),
  };
}
