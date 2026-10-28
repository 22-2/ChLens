// 抽出レスも、本文が所有するポップアップの状態と寿命を共有する。
export interface ThreadResInteractions {
  showAnchor: (targets: number[], rect: DOMRect, label: string) => void;
  hideAnchor: () => void;
  openReplies: (resNum: number, x: number, y: number) => void;
}
const entries = new Map<string, { threadUrl: string; handlers: ThreadResInteractions }>();

export function registerThreadResInteractions(
  tabId: string,
  threadUrl: string,
  handlers: ThreadResInteractions,
): () => void {
  const entry = { threadUrl, handlers };
  entries.set(tabId, entry);
  return () => {
    if (entries.get(tabId) === entry) entries.delete(tabId);
  };
}

export function getThreadResInteractions(
  tabId: string,
  threadUrl: string,
): ThreadResInteractions | undefined {
  const entry = entries.get(tabId);
  return entry?.threadUrl === threadUrl ? entry.handlers : undefined;
}
