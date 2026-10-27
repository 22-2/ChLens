import { createLogger } from "src/app/logger";

const logger = createLogger("view/browser/page-actions");
const actionsByWindow = new WeakMap<Window, Map<string, () => void>>();
const targetsByWindow = new WeakMap<Window, Set<string>>();
const windowIds = new WeakMap<Window, number>();
let nextWindowId = 1;

function getWindowId(viewWindow: Window): number {
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
      windowId: getWindowId(viewWindow),
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

export type PageActionResult = "executed" | "target-unavailable" | "unsupported";

/** 描画中のページだけが操作を提供し、窓とタブの両方で対象を区別する。 */
export function registerFilterToggle(
  viewWindow: Window,
  tabId: string,
  toggle: () => void,
): () => void {
  let actions = actionsByWindow.get(viewWindow);
  if (!actions) {
    actions = new Map();
    actionsByWindow.set(viewWindow, actions);
  }
  if (actions.has(tabId)) {
    logger.error("フィルター操作の二重登録を拒否しました", {
      windowId: getWindowId(viewWindow),
      tabId,
    });
    return () => undefined;
  }
  actions.set(tabId, toggle);
  return () => {
    if (actions.get(tabId) === toggle) actions.delete(tabId);
  };
}

/** 対象の表示終了と、表示中だが操作に未対応の場合を区別する。 */
export function toggleFilter(viewWindow: Window, tabId: string): PageActionResult {
  const toggle = actionsByWindow.get(viewWindow)?.get(tabId);
  if (toggle) {
    toggle();
    return "executed";
  }
  const result = targetsByWindow.get(viewWindow)?.has(tabId) ? "unsupported" : "target-unavailable";
  // 対象が閉じた競合と、入口の出し分けが実装と食い違った場合を後から区別できるようにする。
  logger.warn("フィルター操作を実行できませんでした", {
    windowId: getWindowId(viewWindow),
    tabId,
    result,
  });
  return result;
}
