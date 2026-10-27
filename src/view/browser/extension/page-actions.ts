import { createLogger } from "src/app/logger";

const logger = createLogger("view/browser/page-actions");
const actionsByWindow = new WeakMap<Window, Map<string, () => void>>();

/** 描画中のスレだけが操作を提供し、窓とタブの両方で対象を区別する。 */
export function registerThreadFilterToggle(
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
    logger.error("スレのフィルター操作の二重登録を拒否しました", { tabId });
    return () => undefined;
  }
  actions.set(tabId, toggle);
  return () => {
    if (actions.get(tabId) === toggle) actions.delete(tabId);
  };
}

/** 対象が終了していれば別のタブへ送らず、実行しなかったことを返す。 */
export function toggleThreadFilter(viewWindow: Window, tabId: string): boolean {
  const toggle = actionsByWindow.get(viewWindow)?.get(tabId);
  if (!toggle) return false;
  toggle();
  return true;
}
