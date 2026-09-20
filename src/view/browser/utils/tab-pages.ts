import type { Page } from "src/view/browser/types";

export type QuickAccessPageType = "bookmarkList" | "historyList" | "writeHistoryList" | "logList";

export type QuickAccessPage = Extract<Page, { type: QuickAccessPageType }>;
export type SettingsPage = Extract<Page, { type: "settings" }>;

const QUICK_ACCESS_PAGE_TITLES: Record<QuickAccessPageType, string> = {
  bookmarkList: "ブックマークリスト",
  historyList: "閲覧履歴",
  writeHistoryList: "書き込み履歴",
  logList: "ログ検索",
};

/**
 * 共通ページの生成を一か所へ集約する。
 *
 * 変更理由: ナビゲーションバーとコマンドパレットが同じページを個別に構築すると、
 * 表示タイトルやページ種別がずれ、別窓から開いたときだけ履歴キーが分かれるため。
 */
export function createQuickAccessPage<Type extends QuickAccessPageType>(
  type: Type,
): Extract<QuickAccessPage, { type: Type }> {
  return {
    type,
    title: QUICK_ACCESS_PAGE_TITLES[type],
  } as Extract<QuickAccessPage, { type: Type }>;
}

export function createSettingsPage(sectionId?: string): SettingsPage {
  return sectionId === undefined
    ? { type: "settings", title: "設定" }
    : { type: "settings", title: "設定", sectionId };
}
