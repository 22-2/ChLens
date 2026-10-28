import type { IRes } from "src/service-container/interfaces";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";

// 抽出ビューは取得済みレスを読むだけにし、操作は対象スレの既存メニューに委ねる。
type MenuBuilder = (response: IRes) => ContextMenuItem[];
const builders = new Map<string, { threadUrl: string; build: MenuBuilder }>();

export function registerThreadResMenu(
  tabId: string,
  threadUrl: string,
  build: MenuBuilder,
): () => void {
  const entry = { threadUrl, build };
  builders.set(tabId, entry);
  return () => {
    if (builders.get(tabId) === entry) builders.delete(tabId);
  };
}

export function buildExtractResMenu(
  tabId: string,
  threadUrl: string,
  response: IRes,
): ContextMenuItem[] | null {
  const entry = builders.get(tabId);
  return entry?.threadUrl === threadUrl ? entry.build(response) : null;
}
