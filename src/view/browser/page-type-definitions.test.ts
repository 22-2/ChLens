import {
  buildHierarchy,
  getDisplayUrl,
  getPageIdentity,
  getPageRenderKey,
  getPageTypeDefinitionByType,
  getPageViewStateKey,
} from "src/view/browser/page-type-definitions";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import type { Page, PageType } from "src/view/browser/types";
import { describe, expect, it } from "vite-plus/test";

// 変更理由: 同一性・表示状態のキーはセッション復元とタブの重複判定に使うため、
// 定義の書き方を変えても全種別の出力が変わらないことをここで固定する。
// URL は正規化の差が出るよう、末尾のスラッシュや http の有無を混ぜる。
const SAMPLE_PAGES = {
  home: { type: "home", title: "ホーム" },
  newTab: { type: "newTab", title: "新しいタブ" },
  boardList: { type: "boardList", title: "板一覧" },
  threadList: {
    type: "threadList",
    title: "テスト板",
    boardUrl: "http://example.com/test",
    boardTitle: "テスト板",
  },
  thread: {
    type: "thread",
    title: "テストスレ",
    threadUrl: "http://example.com/test/read.cgi/test/1234567890",
  },
  settings: { type: "settings", title: "設定" },
  bookmarkList: { type: "bookmarkList", title: "ブックマーク" },
  historyList: { type: "historyList", title: "閲覧履歴" },
  writeHistoryList: { type: "writeHistoryList", title: "書き込み履歴" },
  logList: { type: "logList", title: "ログ検索" },
} as const satisfies { [T in PageType]: Extract<Page, { type: T }> };

function describePage(page: Page) {
  return {
    refreshable: getPageTypeDefinitionByType(page.type).refreshable,
    filterable: getPageTypeDefinitionByType(page.type).filterable,
    autoRefreshKey: getAutoRefreshPageKey(page),
    identity: getPageIdentity(page),
    viewStateKey: getPageViewStateKey(page),
    renderKey: getPageRenderKey("tab-1", 2, page),
    displayUrl: getDisplayUrl(page),
    hierarchy: buildHierarchy(page).map((ancestor) =>
      ancestor.type === "threadList" ? `${ancestor.type}:${ancestor.boardUrl}` : ancestor.type,
    ),
  };
}

describe("ページ種別の定義", () => {
  it("全種別の判定結果が移行前と変わらない", () => {
    const table = Object.fromEntries(
      Object.values(SAMPLE_PAGES).map((page) => [page.type, describePage(page)]),
    );

    expect(table).toMatchInlineSnapshot(`
      {
        "boardList": {
          "autoRefreshKey": null,
          "displayUrl": "板一覧",
          "filterable": true,
          "hierarchy": [
            "home",
            "boardList",
          ],
          "identity": "boardList",
          "refreshable": true,
          "renderKey": "tab-1:2:boardList",
          "viewStateKey": "boardList",
        },
        "bookmarkList": {
          "autoRefreshKey": null,
          "displayUrl": "ブックマーク",
          "filterable": true,
          "hierarchy": [
            "home",
            "bookmarkList",
          ],
          "identity": "bookmarkList",
          "refreshable": false,
          "renderKey": "tab-1:2:bookmarkList",
          "viewStateKey": "bookmarkList",
        },
        "historyList": {
          "autoRefreshKey": null,
          "displayUrl": "閲覧履歴",
          "filterable": true,
          "hierarchy": [
            "home",
            "historyList",
          ],
          "identity": "historyList",
          "refreshable": true,
          "renderKey": "tab-1:2:historyList",
          "viewStateKey": "historyList",
        },
        "home": {
          "autoRefreshKey": null,
          "displayUrl": "",
          "filterable": false,
          "hierarchy": [
            "home",
          ],
          "identity": "home",
          "refreshable": false,
          "renderKey": "tab-1:2:home",
          "viewStateKey": "home",
        },
        "logList": {
          "autoRefreshKey": null,
          "displayUrl": "ログ検索",
          "filterable": true,
          "hierarchy": [
            "home",
            "logList",
          ],
          "identity": "logList",
          "refreshable": true,
          "renderKey": "tab-1:2:logList",
          "viewStateKey": "logList",
        },
        "newTab": {
          "autoRefreshKey": null,
          "displayUrl": "",
          "filterable": false,
          "hierarchy": [
            "home",
          ],
          "identity": "newTab",
          "refreshable": false,
          "renderKey": "tab-1:2:newTab",
          "viewStateKey": "newTab",
        },
        "settings": {
          "autoRefreshKey": null,
          "displayUrl": "設定",
          "filterable": false,
          "hierarchy": [
            "home",
            "settings",
          ],
          "identity": "settings",
          "refreshable": false,
          "renderKey": "tab-1:2:settings",
          "viewStateKey": "settings",
        },
        "thread": {
          "autoRefreshKey": "thread:http://example.com/test/read.cgi/test/1234567890/",
          "displayUrl": "http://example.com/test/read.cgi/test/1234567890",
          "filterable": true,
          "hierarchy": [
            "home",
            "threadList:http://example.com/test/",
            "thread",
          ],
          "identity": "thread:http://example.com/test/read.cgi/test/1234567890/",
          "refreshable": true,
          "renderKey": "tab-1:2:thread:http://example.com/test/read.cgi/test/1234567890",
          "viewStateKey": "thread:http://example.com/test/read.cgi/test/1234567890/",
        },
        "threadList": {
          "autoRefreshKey": "threadList:http://example.com/test/",
          "displayUrl": "http://example.com/test",
          "filterable": true,
          "hierarchy": [
            "home",
            "threadList:http://example.com/test",
          ],
          "identity": "threadList:http://example.com/test/",
          "refreshable": true,
          "renderKey": "tab-1:2:threadList:http://example.com/test",
          "viewStateKey": "threadList:http://example.com/test/",
        },
        "writeHistoryList": {
          "autoRefreshKey": null,
          "displayUrl": "書き込み履歴",
          "filterable": true,
          "hierarchy": [
            "home",
            "writeHistoryList",
          ],
          "identity": "writeHistoryList",
          "refreshable": true,
          "renderKey": "tab-1:2:writeHistoryList",
          "viewStateKey": "writeHistoryList",
        },
      }
    `);
  });

  it("スレと板は URL ごとに別ページとして区別する", () => {
    const otherThread: Page = {
      type: "thread",
      title: "別のスレ",
      threadUrl: "http://example.com/test/read.cgi/test/2222222222",
    };
    const otherBoard: Page = {
      type: "threadList",
      title: "別の板",
      boardUrl: "http://example.com/other",
      boardTitle: "別の板",
    };

    expect(getPageIdentity(otherThread)).not.toBe(getPageIdentity(SAMPLE_PAGES.thread));
    expect(getPageIdentity(otherBoard)).not.toBe(getPageIdentity(SAMPLE_PAGES.threadList));
  });

  it("クイックアクセスの各一覧は互いに別ページとして扱う", () => {
    const identities = [
      SAMPLE_PAGES.bookmarkList,
      SAMPLE_PAGES.historyList,
      SAMPLE_PAGES.writeHistoryList,
      SAMPLE_PAGES.logList,
    ].map(getPageIdentity);

    expect(new Set(identities).size).toBe(identities.length);
  });
});
