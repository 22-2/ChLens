import { File, History, House, ScrollText, Settings } from "lucide-react";
import type { PageOfType, PageTypeDefinitions } from "src/view/browser/page-type-definitions";

export function createHomePage(): PageOfType<"home"> {
  return { type: "home", title: "ホーム" };
}

type CorePageType = "home" | "newTab" | "settings" | "historyList" | "logList";
type CorePageDefinitions = Pick<PageTypeDefinitions, CorePageType>;

/** 機能に属さない基本ページが所有する共通メタデータ。 */
export const CORE_PAGE_TYPE_DEFINITIONS: CorePageDefinitions = {
  home: {
    icon: House,
    refreshable: false,
    filterable: false,
    autoRefreshable: false,
    buildHierarchy: () => [createHomePage()],
  },
  // 旧セッションに残る空タブも同じホームへ描画し、入口画面を一つに保つ。
  newTab: {
    icon: File,
    refreshable: false,
    filterable: false,
    autoRefreshable: false,
    buildHierarchy: () => [createHomePage()],
  },
  settings: {
    icon: Settings,
    refreshable: false,
    filterable: false,
    autoRefreshable: false,
    displayLabel: "設定",
  },
  historyList: {
    icon: History,
    refreshable: true,
    filterable: true,
    autoRefreshable: false,
    displayLabel: "閲覧履歴",
  },
  logList: {
    icon: ScrollText,
    refreshable: true,
    filterable: true,
    autoRefreshable: false,
    displayLabel: "ログ検索",
  },
};
