import { expect, type Page } from "@playwright/test";

import type { startLocalBoard } from "./localboard.mjs";

type LocalBoard = Awaited<ReturnType<typeof startLocalBoard>>;

const RESTORED_PAGES = [
  ["home", "home", "ホーム", ".board-start-page__title"],
  ["legacy", "home", "ホーム", ".board-start-page__title"],
  ["boardList", "boardList", "板一覧", ".board-list-page"],
  ["threadList", "threadList", "ローカルテスト板", ".thread-list-view"],
  ["thread", "thread", "ローカルテストスレッド", '[data-res-num="2"]'],
  ["bookmarkList", "bookmarkList", "ブックマークリスト", ".thread-list-page"],
  ["historyList", "historyList", "閲覧履歴", ".thread-list-page"],
  ["writeHistoryList", "writeHistoryList", "書き込み履歴", ".write-history-list-page"],
  ["logList", "logList", "ログ検索", ".thread-list-page"],
  ["settings", "settings", "設定", ".settings-page__shell"],
] as const;

/** 旧newTabを含む保存済みセッションを、起動処理より前に一度だけ用意する。 */
export async function seedPageTypesSession(page: Page, localBoard: LocalBoard): Promise<void> {
  const pages = [
    { id: "home", type: "home", title: "ホーム" },
    { id: "legacy", type: "newTab", title: "新しいタブ" },
    { id: "boardList", type: "boardList", title: "板一覧" },
    {
      id: "threadList",
      type: "threadList",
      title: "ローカルテスト板",
      boardTitle: "ローカルテスト板",
      boardUrl: localBoard.boardUrl,
    },
    {
      id: "thread",
      type: "thread",
      title: "ローカルテストスレッド",
      threadUrl: localBoard.threadUrl,
    },
    { id: "bookmarkList", type: "bookmarkList", title: "ブックマークリスト" },
    { id: "historyList", type: "historyList", title: "閲覧履歴" },
    { id: "writeHistoryList", type: "writeHistoryList", title: "書き込み履歴" },
    { id: "logList", type: "logList", title: "ログ検索" },
    { id: "settings", type: "settings", title: "設定" },
  ];
  await page.addInitScript((savedPages) => {
    if (localStorage.getItem("e2e_page_types_seeded")) return;
    const tabs = savedPages.map(({ id, ...savedPage }) => ({
      id: `page-${id}`,
      history: [savedPage],
      currentIndex: 0,
      pinned: false,
    }));
    localStorage.setItem("config_tab_bar_orientation", "vertical");
    localStorage.setItem("config_tab_bar_collapsed", "off");
    localStorage.setItem(
      "chlens_browser_session",
      JSON.stringify({
        panes: [{ id: "page-types-pane", tabs, activeTabId: "page-home" }],
        activePaneId: "page-types-pane",
        closedTabs: [],
      }),
    );
    localStorage.setItem("e2e_page_types_seeded", "true");
  }, pages);
  await page.reload();
}

/** 各タブを選択し、保存したページの種別と表示が復元されていることを確認する。 */
export async function verifyRestoredPages(page: Page): Promise<void> {
  await expect(page.locator(".tab[data-tab-id]")).toHaveCount(RESTORED_PAGES.length);
  const panel = page.locator('.content-area__tab-panel[data-active="true"]');
  for (const [id, type, title, content] of RESTORED_PAGES) {
    const tab = page.locator(`[data-tab-id="page-${id}"]`);
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("title-bar-title")).toHaveAttribute("data-page-type", type);
    await expect(page.getByTestId("title-bar-title")).toHaveText(title);
    await expect(panel.locator(content)).toBeVisible();
  }
  // 選択状態と旧ページの移行が保存されてから再起動し、初期データの再注入を結果と取り違えない。
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("chlens_browser_session");
        if (!raw) return null;
        const saved = JSON.parse(raw) as {
          panes: { activeTabId: string; tabs: { id: string; history: { type: string }[] }[] }[];
        };
        const pane = saved.panes[0];
        return {
          activeTabId: pane?.activeTabId,
          legacyType: pane?.tabs.find((tab) => tab.id === "page-legacy")?.history[0]?.type,
        };
      }),
    )
    .toEqual({ activeTabId: "page-settings", legacyType: "home" });
}
