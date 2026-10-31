import { cleanup, renderHook } from "@testing-library/react";
import { COMMAND_REQUEST_IDS } from "src/view/browser/commands/command-runtime";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { useOmnibarSuggestionMenuItems } from "src/view/browser/shell/use-omnibar-suggestion-menu-items";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { OmnibarSuggestion } from "src/view/browser/utils/omnibar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { runCommandRequestMock, deleteThreadLogAndCloseTabMock } = vi.hoisted(() => ({
  runCommandRequestMock: vi.fn(),
  deleteThreadLogAndCloseTabMock: vi.fn(),
}));
// 実際のコマンドやログ削除は副作用が大きいため、呼び出し内容だけを確かめる。
vi.mock("src/view/browser/commands/command-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/view/browser/commands/command-runtime")>()),
  runCommandRequest: runCommandRequestMock,
}));
vi.mock("src/view/browser/commands/thread-log-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/view/browser/commands/thread-log-actions")>()),
  deleteThreadLogAndCloseTab: deleteThreadLogAndCloseTabMock,
}));

const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";
const OTHER_THREAD_URL = "https://example.com/test/read.cgi/board/1000000002/";
const BOARD_URL = "https://example.com/test/";
const EXTERNAL_URL = "https://example.org/some/page";

const toast = { info: vi.fn(), error: vi.fn(), success: vi.fn() } as unknown as Parameters<
  typeof useOmnibarSuggestionMenuItems
>[0]["toast"];
const windowOpen = vi.fn();
const viewSurface = {
  window: { open: windowOpen },
  document,
} as unknown as Parameters<typeof useOmnibarSuggestionMenuItems>[0]["viewSurface"];

type Options = Parameters<typeof useOmnibarSuggestionMenuItems>[0];

function createSuggestion(overrides: Partial<OmnibarSuggestion> = {}): OmnibarSuggestion {
  return {
    url: THREAD_URL,
    title: "テストスレ",
    boardTitle: "テスト板",
    score: 1,
    isBookmark: false,
    sources: [],
    ...overrides,
  };
}

function createOptions(
  suggestion: OmnibarSuggestion | null = createSuggestion(),
  overrides: Partial<Options> = {},
): Options {
  return {
    suggestionMenuState: suggestion ? { x: 10, y: 20, suggestion } : null,
    openSuggestion: vi.fn(),
    dispatch: vi.fn(),
    panes: [],
    runTabCommand: vi.fn(() => true),
    toast,
    viewSurface,
    ...overrides,
  };
}

function renderSuggestionMenu(options: Options) {
  return renderHook(() => useOmnibarSuggestionMenuItems(options)).result;
}

function getItemIds(items: ReturnType<typeof useOmnibarSuggestionMenuItems>): string[] {
  return items.map((item) => item.id);
}

function selectItem(items: ReturnType<typeof useOmnibarSuggestionMenuItems>, id: string) {
  const item = items.find((entry) => entry.id === id);
  if (!item?.onSelect) throw new Error(`メニュー項目 ${id} は選択できません`);
  item.onSelect();
}

function getLabel(items: ReturnType<typeof useOmnibarSuggestionMenuItems>, id: string) {
  return items.find((entry) => entry.id === id)?.label;
}

function createTab(id: string, url: string, pinned = false) {
  return {
    id,
    pinned,
    history: [{ type: "thread", title: "テストスレ", threadUrl: url }],
    currentIndex: 0,
  };
}

describe("useOmnibarSuggestionMenuItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("候補の右クリックメニューがなければ、項目を出さない", () => {
    const result = renderSuggestionMenu(createOptions(null));

    expect(result.current).toEqual([]);
  });

  it("スレッドの候補では、開く・ブックマーク・コピー・板・ログ削除・ブラウザで開くを並べる", () => {
    const result = renderSuggestionMenu(createOptions());

    expect(getItemIds(result.current)).toEqual([
      "open-current",
      "open-new-tab",
      "suggestion-actions-separator",
      "bookmark-toggle",
      "copy-title",
      "copy-url",
      "copy-title-url",
      "thread-actions-separator",
      "open-board",
      "delete-thread-log",
      "open-in-browser",
    ]);
  });

  it("「このタブで開く」は、候補を開く操作へ委ねる", () => {
    const options = createOptions();
    const result = renderSuggestionMenu(options);

    selectItem(result.current, "open-current");

    expect(options.openSuggestion).toHaveBeenCalledWith(createSuggestion());
  });

  it("「新しいタブで開く」は、フォーカス付きでスレッドのタブを新しく開く", () => {
    const options = createOptions();
    const result = renderSuggestionMenu(options);

    selectItem(result.current, "open-new-tab");

    expect(options.dispatch).toHaveBeenCalledWith(
      tabActions.openInNewTabForce(
        expect.objectContaining({ type: "thread", threadUrl: THREAD_URL, title: "テストスレ" }),
        { focus: true },
      ),
    );
  });

  it("ブックマークの切り替えは、スレッドを対象にした共通コマンドとして実行する", () => {
    const options = createOptions();
    const result = renderSuggestionMenu(options);

    selectItem(result.current, "bookmark-toggle");

    expect(runCommandRequestMock).toHaveBeenCalledWith(
      {
        id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE,
        args: { target: { kind: "thread", title: "テストスレ", url: THREAD_URL } },
      },
      { surface: viewSurface, toast },
    );
  });

  it.each([
    ["copy-title", "title"],
    ["copy-url", "url"],
    ["copy-title-url", "title-url"],
  ] as const)("項目 %s は、形式 %s でスレッドをコピーする", (id, format) => {
    const result = renderSuggestionMenu(createOptions());

    selectItem(result.current, id);

    expect(runCommandRequestMock).toHaveBeenCalledWith(
      {
        id: COMMAND_REQUEST_IDS.TARGET_COPY,
        args: { target: { kind: "thread", title: "テストスレ", url: THREAD_URL }, format },
      },
      { surface: viewSurface, toast },
    );
  });

  it("板の候補では、スレッド向けのログ削除などを出さず、板名をコピーする", () => {
    const options = createOptions(
      createSuggestion({ url: BOARD_URL, title: "テスト板", boardTitle: "" }),
    );
    const result = renderSuggestionMenu(options);

    expect(getItemIds(result.current)).not.toContain("delete-thread-log");
    expect(getItemIds(result.current)).not.toContain("open-board");
    expect(getLabel(result.current, "copy-title")).toBe("板名をコピー");

    selectItem(result.current, "copy-title");

    expect(runCommandRequestMock).toHaveBeenCalledWith(
      {
        id: COMMAND_REQUEST_IDS.TARGET_COPY,
        args: { target: { kind: "board", title: "テスト板", url: BOARD_URL }, format: "title" },
      },
      { surface: viewSurface, toast },
    );
  });

  it("解釈できないURLの候補では、URLのコピーとブラウザで開く項目だけを出す", () => {
    const options = createOptions(createSuggestion({ url: EXTERNAL_URL }));
    const result = renderSuggestionMenu(options);

    expect(getItemIds(result.current)).toEqual(["copy-url", "open-in-browser"]);

    selectItem(result.current, "copy-url");

    expect(runCommandRequestMock).toHaveBeenCalledWith(
      {
        id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT,
        args: { text: EXTERNAL_URL },
      },
      { surface: viewSurface, toast },
    );
  });

  it("ブラウザで開く項目は、候補のURLを新しいウィンドウで開く", () => {
    const result = renderSuggestionMenu(createOptions());

    selectItem(result.current, "open-in-browser");

    expect(windowOpen).toHaveBeenCalledWith(THREAD_URL, "_blank", "noopener,noreferrer");
  });

  it("開いているタブがあると、ログ削除の表示は閉じる操作を含め、削除時に該当タブだけを閉じる", () => {
    const options = createOptions(createSuggestion(), {
      panes: [
        {
          id: "pane-1",
          tabs: [
            createTab("tab-1", THREAD_URL),
            createTab("tab-2", THREAD_URL, true),
            createTab("tab-3", OTHER_THREAD_URL),
          ],
        },
      ] as unknown as Options["panes"],
    });
    const result = renderSuggestionMenu(options);

    expect(getLabel(result.current, "delete-thread-log")).toBe(
      "スレログと閲覧履歴を削除してタブを閉じる",
    );

    selectItem(result.current, "delete-thread-log");

    expect(deleteThreadLogAndCloseTabMock).toHaveBeenCalledWith(
      expect.objectContaining({ threadUrl: THREAD_URL }),
    );
    const { closeTab } = deleteThreadLogAndCloseTabMock.mock.calls[0][0] as {
      closeTab: () => boolean;
    };
    expect(closeTab()).toBe(true);
    expect(options.runTabCommand).toHaveBeenCalledTimes(1);
    expect(options.runTabCommand).toHaveBeenCalledWith(TAB_COMMAND_IDS.CLOSE, { tabId: "tab-1" });
  });

  it("開いているタブがなければ、ログ削除の表示はタブを閉じる文言を含まない", () => {
    const result = renderSuggestionMenu(createOptions());

    expect(getLabel(result.current, "delete-thread-log")).toBe("スレログと閲覧履歴を削除");
  });
});
