import { cleanup, renderHook } from "@testing-library/react";
import {
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  BOTTOM_PANEL_WRITE_TAB_ID,
} from "src/view/browser/hooks/use-bottom-panel";
import { useNavigationMenuItems } from "src/view/browser/shell/use-navigation-menu-items";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import { createBoardPage, createQuickAccessPage } from "src/view/browser/utils/tab-pages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { openCommandPaletteMock } = vi.hoisted(() => ({ openCommandPaletteMock: vi.fn() }));
vi.mock("src/view/browser/commands/command-palette-store", () => ({
  commandPalette: { open: openCommandPaletteMock },
}));

const THREAD_PAGE: ThreadPageType = {
  type: "thread",
  title: "テストスレ",
  threadUrl: "https://example.com/test/read.cgi/board/1000000001/",
};
const BOARD_PAGE = createBoardPage("https://example.com/test/", "テスト板");

type Options = Parameters<typeof useNavigationMenuItems>[0];

function createOptions(overrides: Partial<Options> = {}) {
  return {
    viewPage: THREAD_PAGE,
    canWrite: true,
    canToggleFilter: true,
    toggleFilterFromMenu: vi.fn(),
    isPanelOpen: false,
    activePanelTabId: BOTTOM_PANEL_THREAD_LIST_TAB_ID,
    togglePanel: vi.fn(),
    openQuickAccessPage: vi.fn(),
    openQuickAccessPageInNewTab: vi.fn(),
    ...overrides,
  };
}

function renderMenu(overrides: Partial<Options> = {}) {
  const options = createOptions(overrides);
  const { result } = renderHook(() => useNavigationMenuItems(options));
  return { options, result };
}

function findItem(items: ReturnType<typeof useNavigationMenuItems>, id: string) {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error(`メニュー項目 ${id} が見つかりません`);
  return item;
}

function selectItem(items: ReturnType<typeof useNavigationMenuItems>, id: string) {
  const item = findItem(items, id);
  if (!("onSelect" in item) || !item.onSelect) {
    throw new Error(`メニュー項目 ${id} は選択できません`);
  }
  item.onSelect();
}

function auxSelectItem(
  items: ReturnType<typeof useNavigationMenuItems>,
  id: string,
  button: number,
) {
  const item = findItem(items, id);
  if (!("onAuxSelect" in item) || !item.onAuxSelect) {
    throw new Error(`メニュー項目 ${id} は中クリックに対応しません`);
  }
  item.onAuxSelect(button);
}

function getIds(items: ReturnType<typeof useNavigationMenuItems>): string[] {
  return items.map((item) => item.id);
}

function getLabel(items: ReturnType<typeof useNavigationMenuItems>, id: string) {
  const item = findItem(items, id);
  return "label" in item ? item.label : undefined;
}

describe("useNavigationMenuItems", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("スレッドを書き込み可能な状態で開いていると、すべての項目を表示順に並べる", () => {
    const { result } = renderMenu();

    expect(getIds(result.current)).toEqual([
      "open-command-palette",
      "open-filter-toolbar",
      "open-thread-list-panel",
      "open-write-panel",
      "quick-access-separator",
      "open-bookmark-list",
      "open-history-list",
      "open-write-history-list",
      "open-log-list",
    ]);
  });

  it("絞り込みが使えないときは、フィルターの項目を出さない", () => {
    const { result } = renderMenu({ canToggleFilter: false });

    expect(getIds(result.current)).not.toContain("open-filter-toolbar");
  });

  it("フィルターの項目を選ぶと、絞り込みの切り替えを実行する", () => {
    const { options, result } = renderMenu();

    selectItem(result.current, "open-filter-toolbar");

    expect(options.toggleFilterFromMenu).toHaveBeenCalledTimes(1);
  });

  it("スレッド以外のページでは、スレ一覧パネルと書き込みパネルを出さない", () => {
    const { result } = renderMenu({ viewPage: BOARD_PAGE });

    expect(getIds(result.current)).not.toContain("open-thread-list-panel");
    expect(getIds(result.current)).not.toContain("open-write-panel");
  });

  it("書き込み権限がなければ、書き込みパネルを出さない", () => {
    const { result } = renderMenu({ canWrite: false });

    expect(getIds(result.current)).toContain("open-thread-list-panel");
    expect(getIds(result.current)).not.toContain("open-write-panel");
  });

  it("スレ一覧パネルが開いていれば、閉じる表示にし、選ぶとそのパネルを切り替える", () => {
    const { options, result } = renderMenu({
      isPanelOpen: true,
      activePanelTabId: BOTTOM_PANEL_THREAD_LIST_TAB_ID,
    });

    expect(getLabel(result.current, "open-thread-list-panel")).toBe("スレ一覧パネルを閉じる");

    selectItem(result.current, "open-thread-list-panel");

    expect(options.togglePanel).toHaveBeenCalledWith(BOTTOM_PANEL_THREAD_LIST_TAB_ID);
  });

  it("別のパネルが開いているときは、スレ一覧パネルを開く表示のままにする", () => {
    const { result } = renderMenu({
      isPanelOpen: true,
      activePanelTabId: BOTTOM_PANEL_WRITE_TAB_ID,
    });

    expect(getLabel(result.current, "open-thread-list-panel")).toBe("スレ一覧パネル");
    expect(getLabel(result.current, "open-write-panel")).toBe("書き込みパネルを閉じる");
  });

  it("コマンドパレットの項目を選ぶと、コマンドの入力欄を開く", () => {
    const { result } = renderMenu();

    selectItem(result.current, "open-command-palette");

    expect(openCommandPaletteMock).toHaveBeenCalledWith("command");
  });

  it("一覧の項目を選ぶと、そのページを現在のタブに開く", () => {
    const { options, result } = renderMenu();

    selectItem(result.current, "open-bookmark-list");

    expect(options.openQuickAccessPage).toHaveBeenCalledWith(createQuickAccessPage("bookmarkList"));
  });

  it.each([
    ["open-bookmark-list", "bookmarkList"],
    ["open-history-list", "historyList"],
    ["open-write-history-list", "writeHistoryList"],
    ["open-log-list", "logList"],
  ] as const)("項目 %s の中クリックでは、新しいタブに開く", (id, pageType) => {
    const { options, result } = renderMenu();

    auxSelectItem(result.current, id, 1);

    expect(options.openQuickAccessPageInNewTab).toHaveBeenCalledWith(
      createQuickAccessPage(pageType),
    );
    expect(options.openQuickAccessPage).not.toHaveBeenCalled();
  });

  it("中クリック以外のボタンでは、新しいタブに開かない", () => {
    const { options, result } = renderMenu();

    auxSelectItem(result.current, "open-history-list", 0);

    expect(options.openQuickAccessPageInNewTab).not.toHaveBeenCalled();
  });
});
