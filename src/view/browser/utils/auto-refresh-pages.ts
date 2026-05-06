import type { Page, Tab } from "src/view/browser/types";

function normalizePageLocation(rawLocation: string): string {
  try {
    const parsed = new window.URL(rawLocation);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "/");
  } catch {
    return rawLocation.trim().replace(/\/+$/, "");
  }
}

export function getAutoRefreshPageKey(page: Page): string | null {
  switch (page.type) {
    case "thread":
      return `thread:${normalizePageLocation(page.threadUrl)}`;
    case "threadList":
      return `threadList:${normalizePageLocation(page.boardUrl)}`;
    default:
      return null;
  }
}

export function isAutoRefreshEnabledForPage(tab: Tab, page: Page): boolean {
  const pageKey = getAutoRefreshPageKey(page);
  return (
    pageKey != null &&
    tab.autoRefreshEnabled &&
    tab.autoRefreshPageKey === pageKey
  );
}

export function resetAutoRefreshState<
  T extends { autoRefreshEnabled: boolean; autoRefreshPageKey: string | null },
>(tab: T): T {
  return {
    ...tab,
    // 変更理由: 自動更新は現在表示しているページだけの一時状態とし、
    // 別ページへ移動した後に意図せず再開しないよう共通ヘルパで必ず解除する。
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  };
}
