import {
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  BOTTOM_PANEL_WRITE_TAB_ID,
} from "src/view/browser/hooks/use-bottom-panel";
import {
  buildNavigationMenuEntries,
  type NavigationMenuEntry,
  type NavigationMenuInput,
} from "src/view/browser/shell/navigation-menu";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import { createBoardPage, createQuickAccessPage } from "src/view/browser/utils/tab-pages";
import { describe, expect, it } from "vite-plus/test";

const THREAD_PAGE: ThreadPageType = {
  type: "thread",
  title: "テストスレ",
  threadUrl: "https://example.com/test/read.cgi/board/1000000001/",
};
const BOARD_PAGE = createBoardPage("https://example.com/test/", "テスト板");

function createInput(overrides: Partial<NavigationMenuInput> = {}): NavigationMenuInput {
  return {
    viewPage: THREAD_PAGE,
    canWrite: true,
    canToggleFilter: true,
    isPanelOpen: false,
    activePanelTabId: BOTTOM_PANEL_THREAD_LIST_TAB_ID,
    ...overrides,
  };
}

function getIds(entries: NavigationMenuEntry[]): string[] {
  return entries.map((entry) => entry.id);
}

function findActionEntry(entries: NavigationMenuEntry[], id: string) {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry || "separator" in entry) throw new Error(`項目 ${id} が見つかりません`);
  return entry;
}

describe("buildNavigationMenuEntries", () => {
  it("スレッドを書き込み可能な状態で開いていると、すべての項目を表示順に返す", () => {
    expect(getIds(buildNavigationMenuEntries(createInput()))).toEqual([
      "open-command-palette",
      "open-filter-toolbar",
      "open-thread-list-panel",
      "open-write-panel",
      "quick-access-separator",
      "open-bookmark-list",
      "open-history-list",
      "open-write-history-list",
      "open-log-list",
      "about-separator",
      "open-about",
    ]);
  });

  it("絞り込みができないときは、フィルターの項目を返さない", () => {
    const entries = buildNavigationMenuEntries(createInput({ canToggleFilter: false }));

    expect(getIds(entries)).not.toContain("open-filter-toolbar");
  });

  it("スレッド以外のページでは、スレ一覧パネルと書き込みパネルを返さない", () => {
    const entries = buildNavigationMenuEntries(createInput({ viewPage: BOARD_PAGE }));

    expect(getIds(entries)).not.toContain("open-thread-list-panel");
    expect(getIds(entries)).not.toContain("open-write-panel");
  });

  it("書き込み権限がなければ、書き込みパネルを返さない", () => {
    const entries = buildNavigationMenuEntries(createInput({ canWrite: false }));

    expect(getIds(entries)).toContain("open-thread-list-panel");
    expect(getIds(entries)).not.toContain("open-write-panel");
  });

  it("開いているパネルの項目は閉じる表示にし、その操作はパネルの切り替えになる", () => {
    const entries = buildNavigationMenuEntries(
      createInput({ isPanelOpen: true, activePanelTabId: BOTTOM_PANEL_THREAD_LIST_TAB_ID }),
    );
    const entry = findActionEntry(entries, "open-thread-list-panel");

    expect(entry.label).toBe("スレ一覧パネルを閉じる");
    expect(entry.action).toEqual({
      type: "toggle-panel",
      panelTabId: BOTTOM_PANEL_THREAD_LIST_TAB_ID,
    });
  });

  it("別のパネルが開いているときは、この項目を開く表示のままにする", () => {
    const entries = buildNavigationMenuEntries(
      createInput({ isPanelOpen: true, activePanelTabId: BOTTOM_PANEL_WRITE_TAB_ID }),
    );

    expect(findActionEntry(entries, "open-thread-list-panel").label).toBe("スレ一覧パネル");
    expect(findActionEntry(entries, "open-write-panel").label).toBe("書き込みパネルを閉じる");
  });

  it("コマンドパレットの項目はコマンドパレットを開く操作を返し、中クリックには対応しない", () => {
    const entry = findActionEntry(
      buildNavigationMenuEntries(createInput()),
      "open-command-palette",
    );

    expect(entry.action).toEqual({ type: "open-command-palette" });
    expect(entry).not.toHaveProperty("middleClickAction");
  });

  it("一覧の項目は、通常の選択では現在のタブに、中クリックでは新しいタブに開く操作を返す", () => {
    const entry = findActionEntry(buildNavigationMenuEntries(createInput()), "open-bookmark-list");
    const page = createQuickAccessPage("bookmarkList");

    expect(entry.action).toEqual({ type: "open-quick-access", page, inNewTab: false });
    expect(entry).toHaveProperty("middleClickAction", {
      type: "open-quick-access",
      page,
      inNewTab: true,
    });
  });
});
