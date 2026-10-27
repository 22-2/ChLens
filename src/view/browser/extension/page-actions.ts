import { createLogger } from "src/app/logger";
import type { ThreadFilter } from "src/view/browser/types";

const logger = createLogger("view/browser/page-actions");
const targetsByWindow = new WeakMap<Window, Set<string>>();
const windowIds = new WeakMap<Window, number>();
let nextWindowId = 1;

export function getPageActionWindowId(viewWindow: Window): number {
  let id = windowIds.get(viewWindow);
  if (id === undefined) {
    id = nextWindowId++;
    windowIds.set(viewWindow, id);
  }
  return id;
}

/** ページの表示中だけ対象を登録し、未対応と表示終了を区別する。 */
export function registerPageTarget(viewWindow: Window, tabId: string): () => void {
  let targets = targetsByWindow.get(viewWindow);
  if (!targets) {
    targets = new Set();
    targetsByWindow.set(viewWindow, targets);
  }
  if (targets.has(tabId)) {
    logger.error("ページ操作の対象の二重登録を拒否しました", {
      windowId: getPageActionWindowId(viewWindow),
      tabId,
    });
    return () => undefined;
  }
  targets.add(tabId);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    targets.delete(tabId);
  };
}

/** 対象の窓で現在表示されているタブだけを操作対象にする。 */
export function isPageTargetAvailable(viewWindow: Window, tabId: string): boolean {
  return targetsByWindow.get(viewWindow)?.has(tabId) ?? false;
}

export type PageActionResult = "executed" | "target-unavailable" | "unsupported";

/** 画面操作ごとに登録を分け、窓とタブで対象を解決する。 */
function createPageAction<Args extends unknown[]>(name: string) {
  const actionsByWindow = new WeakMap<Window, Map<string, (...args: Args) => void>>();

  function register(
    viewWindow: Window,
    tabId: string,
    action: (...args: Args) => void,
  ): () => void {
    let actions = actionsByWindow.get(viewWindow);
    if (!actions) {
      actions = new Map();
      actionsByWindow.set(viewWindow, actions);
    }
    if (actions.has(tabId)) {
      logger.error("ページ操作の二重登録を拒否しました", {
        operation: name,
        windowId: getPageActionWindowId(viewWindow),
        tabId,
      });
      return () => undefined;
    }
    actions.set(tabId, action);
    return () => {
      if (actions.get(tabId) === action) actions.delete(tabId);
    };
  }

  function run(viewWindow: Window, tabId: string, ...args: Args): PageActionResult {
    const action = actionsByWindow.get(viewWindow)?.get(tabId);
    if (action) {
      action(...args);
      return "executed";
    }
    const result = targetsByWindow.get(viewWindow)?.has(tabId)
      ? "unsupported"
      : "target-unavailable";
    // 表示終了との競合と、入口の出し分けが実装と食い違った場合を区別できるようにする。
    logger.warn("ページ操作を実行できませんでした", {
      operation: name,
      windowId: getPageActionWindowId(viewWindow),
      tabId,
      result,
    });
    return result;
  }

  return { register, run };
}

const filterToggle = createPageAction<[]>("filter.toggle");
const threadFilterModeToggle = createPageAction<[Exclude<ThreadFilter, "all">]>(
  "thread.filter-mode.toggle",
);

export const registerFilterToggle = filterToggle.register;
export const toggleFilter = filterToggle.run;
export const registerThreadFilterModeToggle = threadFilterModeToggle.register;
export const toggleThreadFilterMode = threadFilterModeToggle.run;
