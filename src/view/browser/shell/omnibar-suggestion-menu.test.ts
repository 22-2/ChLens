import { COMMAND_REQUEST_IDS } from "src/view/browser/commands/command-runtime";
import {
  buildOmnibarSuggestionMenuEntries,
  type OmnibarSuggestionMenuEntry,
} from "src/view/browser/shell/omnibar-suggestion-menu";
import type { useTabPanes } from "src/view/browser/state/tabs/use-tab-store";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
import type { OmnibarSuggestion } from "src/view/browser/utils/omnibar";
import { createBoardPage } from "src/view/browser/utils/tab-pages";
import { describe, expect, it } from "vite-plus/test";

const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";
const OTHER_THREAD_URL = "https://example.com/test/read.cgi/board/1000000002/";
const BOARD_URL = "https://example.com/test/";
const EXTERNAL_URL = "https://example.org/some/page";

type Panes = ReturnType<typeof useTabPanes>["panes"];

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

function createTab(id: string, url: string, pinned = false) {
  return {
    id,
    pinned,
    history: [{ type: "thread", title: "テストスレ", threadUrl: url }],
    currentIndex: 0,
  };
}

/** 1つのペインに指定のタブを並べた状態を作る。 */
function createPanes(tabs: ReturnType<typeof createTab>[]): Panes {
  return [{ id: "pane-1", tabs }] as unknown as Panes;
}

function getIds(entries: OmnibarSuggestionMenuEntry[]): string[] {
  return entries.map((entry) => entry.id);
}

function findActionEntry(entries: OmnibarSuggestionMenuEntry[], id: string) {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry || "separator" in entry) throw new Error(`項目 ${id} が見つかりません`);
  return entry;
}

describe("buildOmnibarSuggestionMenuEntries", () => {
  it("スレッドの候補は、開く・ブックマーク・コピー・板・ログ削除・ブラウザの順に並べる", () => {
    const entries = buildOmnibarSuggestionMenuEntries(createSuggestion(), []);

    expect(getIds(entries)).toEqual([
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

  it("解釈できないURLの候補は、URLのコピーとブラウザで開く項目だけを返す", () => {
    const entries = buildOmnibarSuggestionMenuEntries(createSuggestion({ url: EXTERNAL_URL }), []);

    expect(getIds(entries)).toEqual(["copy-url", "open-in-browser"]);
    expect(findActionEntry(entries, "copy-url").action).toEqual({
      type: "run-command",
      request: {
        id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT,
        args: { text: EXTERNAL_URL },
      },
    });
  });

  it("「このタブで開く」は、候補そのものを対象にした操作を返す", () => {
    const suggestion = createSuggestion();
    const entries = buildOmnibarSuggestionMenuEntries(suggestion, []);

    expect(findActionEntry(entries, "open-current").action).toEqual({
      type: "open-current",
      suggestion,
    });
  });

  it("「新しいタブで開く」は、候補のタイトルを持つスレッドのページを返す", () => {
    const entries = buildOmnibarSuggestionMenuEntries(createSuggestion(), []);

    expect(findActionEntry(entries, "open-new-tab").action).toEqual({
      type: "open-new-tab",
      page: expect.objectContaining({
        type: "thread",
        threadUrl: THREAD_URL,
        title: "テストスレ",
      }),
    });
  });

  it("ブックマークの切り替えは、スレッドを対象にしたコマンド要求を返す", () => {
    const entries = buildOmnibarSuggestionMenuEntries(createSuggestion(), []);

    expect(findActionEntry(entries, "bookmark-toggle").action).toEqual({
      type: "run-command",
      request: {
        id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE,
        args: { target: { kind: "thread", title: "テストスレ", url: THREAD_URL } },
      },
    });
  });

  it.each([
    ["copy-title", "title", "スレタイをコピー"],
    ["copy-url", "url", "URLをコピー"],
    ["copy-title-url", "title-url", "スレタイ＆URLをコピー"],
  ] as const)("項目 %s は形式 %s のコピー要求を返し、ラベルは「%s」になる", (id, format, label) => {
    const entries = buildOmnibarSuggestionMenuEntries(createSuggestion(), []);
    const entry = findActionEntry(entries, id);

    expect(entry.label).toBe(label);
    expect(entry.action).toEqual({
      type: "run-command",
      request: {
        id: COMMAND_REQUEST_IDS.TARGET_COPY,
        args: {
          target: { kind: "thread", title: "テストスレ", url: THREAD_URL },
          format,
        },
      },
    });
  });

  it("板の候補は板名のラベルと板を対象にした要求を返し、スレッド向けの項目を含めない", () => {
    const entries = buildOmnibarSuggestionMenuEntries(
      createSuggestion({ url: BOARD_URL, title: "テスト板", boardTitle: "" }),
      [],
    );

    expect(getIds(entries)).not.toContain("delete-thread-log");
    expect(getIds(entries)).not.toContain("open-board");
    expect(findActionEntry(entries, "copy-title").label).toBe("板名をコピー");
    expect(findActionEntry(entries, "copy-title").action).toEqual({
      type: "run-command",
      request: {
        id: COMMAND_REQUEST_IDS.TARGET_COPY,
        args: {
          target: { kind: "board", title: "テスト板", url: BOARD_URL },
          format: "title",
        },
      },
    });
  });

  it("板を開く操作は、スレッドから求めた板のURLを使う", () => {
    const entries = buildOmnibarSuggestionMenuEntries(createSuggestion(), []);

    expect(findActionEntry(entries, "open-board").action).toEqual({
      type: "open-new-tab",
      page: createBoardPage(getBoardUrlFromThreadUrl(THREAD_URL), "テスト板"),
    });
  });

  it("ログ削除の閉じ対象は、同じスレッドのピン留めされていないタブだけにする", () => {
    const panes = createPanes([
      createTab("tab-1", THREAD_URL),
      createTab("tab-2", THREAD_URL, true),
      createTab("tab-3", OTHER_THREAD_URL),
    ]);
    const entries = buildOmnibarSuggestionMenuEntries(createSuggestion(), panes);
    const entry = findActionEntry(entries, "delete-thread-log");

    expect(entry.label).toBe("スレログと閲覧履歴を削除してタブを閉じる");
    expect(entry.action).toEqual({
      type: "delete-thread-log",
      threadUrl: THREAD_URL,
      tabIds: ["tab-1"],
    });
  });

  it("開いているタブがなければ、ログ削除は閉じ対象を空にし、閉じる文言を含めない", () => {
    const entries = buildOmnibarSuggestionMenuEntries(createSuggestion(), []);
    const entry = findActionEntry(entries, "delete-thread-log");

    expect(entry.label).toBe("スレログと閲覧履歴を削除");
    expect(entry.action).toEqual({
      type: "delete-thread-log",
      threadUrl: THREAD_URL,
      tabIds: [],
    });
  });

  it("ブラウザで開く項目は、候補のURLを対象にする", () => {
    const entries = buildOmnibarSuggestionMenuEntries(createSuggestion(), []);

    expect(findActionEntry(entries, "open-in-browser").action).toEqual({
      type: "open-in-browser",
      url: THREAD_URL,
    });
  });
});
