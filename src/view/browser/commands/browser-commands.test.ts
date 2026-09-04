import { container } from "src/service-container";
import {
  executeBrowserCommand,
  getDatUrlForCommand,
  getSubjectUrlForCommand,
  resolveBrowserCommands,
  type BrowserCommandContext,
} from "src/view/browser/commands/browser-commands";
import type { ScopedTabAction } from "src/view/browser/hooks/use-tab-store";
import type { Page, Tab } from "src/view/browser/types";
import { setItestServerMapForTesting } from "src/view/browser/utils/itest-server-map";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  askBoardTitleByUrlMock,
  copyTextMock,
  encodeThreadAsToonMock,
  estimateToonTokenCountMock,
  getThreadMock,
  openNextThreadSearchDialogMock,
  requestThreadResJumpMock,
  removeTabsMock,
  queryTabsMock,
  toastErrorMock,
  toastInfoMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  askBoardTitleByUrlMock: vi.fn(),
  copyTextMock: vi.fn<() => Promise<void>>(),
  encodeThreadAsToonMock: vi.fn(),
  estimateToonTokenCountMock: vi.fn<() => number>(),
  getThreadMock: vi.fn(),
  openNextThreadSearchDialogMock: vi.fn<() => Promise<void>>(),
  requestThreadResJumpMock: vi.fn(),
  removeTabsMock: vi.fn(),
  queryTabsMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("src/core/BoardTitleSolver.js", () => ({
  askByUrl: askBoardTitleByUrlMock,
}));

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/clipboard")>();
  return { ...actual, copyText: copyTextMock };
});

vi.mock("src/view/browser/utils/thread-toon", () => ({
  encodeThreadAsToon: encodeThreadAsToonMock,
  estimateToonTokenCount: estimateToonTokenCountMock,
}));

vi.mock("src/view/browser/utils/thread-read-state", () => ({
  requestThreadResJump: requestThreadResJumpMock,
}));

function createTab(page: Page): Tab {
  return {
    id: "tab-1",
    history: [page],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  };
}

function createContext(
  page: Page,
  closedTabs: readonly Tab[] = [],
): {
  context: BrowserCommandContext;
  dispatch: ReturnType<typeof vi.fn<(action: ScopedTabAction) => void>>;
} {
  const activeTab = createTab(page);
  const dispatch = vi.fn<(action: ScopedTabAction) => void>();
  return {
    context: {
      currentPage: page,
      activeTab,
      tabs: [activeTab],
      closedTabs,
      isTwoPane: false,
      isWritePanelOpen: false,
      dispatch,
      toggleWritePanel: vi.fn(),
      openResponseJumpDialog: vi.fn(),
      openNextThreadSearchDialog: openNextThreadSearchDialogMock,
    },
    dispatch,
  };
}

describe("browser commands", () => {
  beforeEach(() => {
    vi.stubGlobal("browser", {
      runtime: { id: "test-extension" },
      tabs: { query: queryTabsMock, remove: removeTabsMock },
    });
    removeTabsMock.mockResolvedValue(undefined);
    copyTextMock.mockResolvedValue();
    askBoardTitleByUrlMock.mockResolvedValue("Software");
    encodeThreadAsToonMock.mockReturnValue("title: Thread");
    estimateToonTokenCountMock.mockReturnValue(1234);
    getThreadMock.mockResolvedValue({
      url: "https://egg.5ch.net/test/read.cgi/software/123/",
      title: "Thread",
      res: [
        {
          num: 1,
          name: "名無しさん",
          mail: "",
          date: "2026/07/23(木) 12:34:56",
          message: "本文",
        },
      ],
    });
    container.thread = { getThread: getThreadMock };
    container.toast = {
      notify: vi.fn(),
      success: toastSuccessMock,
      error: toastErrorMock,
      info: toastInfoMock,
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    copyTextMock.mockReset();
    askBoardTitleByUrlMock.mockReset();
    encodeThreadAsToonMock.mockReset();
    estimateToonTokenCountMock.mockReset();
    getThreadMock.mockReset();
    openNextThreadSearchDialogMock.mockReset();
    requestThreadResJumpMock.mockReset();
    removeTabsMock.mockReset();
    queryTabsMock.mockReset();
    toastErrorMock.mockReset();
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    setItestServerMapForTesting([]);
  });

  it("ページ条件に合わないコマンドを一覧から除外する", () => {
    const { context } = createContext({ type: "home", title: "ホーム" });
    const ids = resolveBrowserCommands(context).map((command) => command.id);

    expect(ids).toContain("navigation.open-settings");
    expect(ids).toContain("layout.toggle-pane");
    expect(ids).not.toContain("page.reload");
    expect(ids).not.toContain("copy.page-url");
    expect(ids).not.toContain("copy.subject-url");
    expect(ids).not.toContain("copy.dat-url");
    expect(ids).not.toContain("copy.thread-toon");
    expect(ids).not.toContain("page.jump-to-response");
    expect(ids).not.toContain("page.search-next-thread");
  });

  it("閉じたタブがないと再オープンを無効化し、履歴があれば既存actionを送る", async () => {
    const { context, dispatch } = createContext({ type: "home", title: "ホーム" });
    const findReopenCommand = () =>
      resolveBrowserCommands(context).find(({ id }) => id === "navigation.reopen-closed-tab");

    expect(findReopenCommand()).toMatchObject({
      label: "閉じたタブを開く",
      englishLabel: "Reopen Closed Tab",
      enabled: false,
    });

    context.closedTabs = [createTab({ type: "home", title: "復元するタブ" })];
    expect(findReopenCommand()).toMatchObject({ enabled: true });

    await expect(executeBrowserCommand("navigation.reopen-closed-tab", context)).resolves.toBe(
      true,
    );
    expect(dispatch).toHaveBeenCalledWith({ type: "REOPEN_CLOSED_TAB" });
  });

  it("スレッドではレス番号ジャンプ用の入力ダイアログを開ける", async () => {
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });
    const openResponseJumpDialog = vi.fn();
    context.openResponseJumpDialog = openResponseJumpDialog;

    const command = resolveBrowserCommands(context).find(
      ({ id }) => id === "page.jump-to-response",
    );
    expect(command).toMatchObject({
      label: "レス番号を指定してジャンプ",
      englishLabel: "Jump to Response Number",
      enabled: true,
    });

    await expect(executeBrowserCommand("page.jump-to-response", context)).resolves.toBe(true);
    expect(openResponseJumpDialog).toHaveBeenCalledOnce();
  });

  it("数字入力のレス番号ジャンプ候補は既存経路へ直接要求する", async () => {
    requestThreadResJumpMock.mockReturnValue({
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
      resNum: 42,
      token: "token",
    });
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });

    await expect(executeBrowserCommand("page.jump-to-response:42", context)).resolves.toBe(true);

    expect(requestThreadResJumpMock).toHaveBeenCalledWith(
      "https://egg.5ch.net/test/read.cgi/software/123/",
      42,
    );
    expect(context.openResponseJumpDialog).not.toHaveBeenCalled();
  });

  it("スレッドでは次スレ候補検索コマンドを実行できる", async () => {
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });

    expect(resolveBrowserCommands(context)).toContainEqual(
      expect.objectContaining({
        id: "page.search-next-thread",
        label: "次スレ候補を検索",
        enabled: true,
      }),
    );

    await expect(executeBrowserCommand("page.search-next-thread", context)).resolves.toBe(true);
    expect(openNextThreadSearchDialogMock).toHaveBeenCalledOnce();
  });

  it("板一覧では板名を再取得して対象板の履歴タイトルを更新する", async () => {
    const page = {
      type: "threadList" as const,
      title: "https://egg.5ch.io/software/",
      boardUrl: "https://egg.5ch.io/software/",
      boardTitle: "https://egg.5ch.io/software/",
    };
    const { context, dispatch } = createContext(page);

    expect(resolveBrowserCommands(context)).toContainEqual(
      expect.objectContaining({
        id: "page.retry-board-title",
        label: "板名を再取得",
        enabled: true,
      }),
    );

    await expect(executeBrowserCommand("page.retry-board-title", context)).resolves.toBe(true);

    expect(askBoardTitleByUrlMock).toHaveBeenCalledWith(page.boardUrl);
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_TITLE_FOR_TAB",
      tabId: "tab-1",
      title: "Software",
      boardUrl: page.boardUrl,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("板名を「Software」に更新しました");
  });

  it("板名を取得できなかった場合は詳細付きのエラーにする", async () => {
    askBoardTitleByUrlMock.mockResolvedValueOnce(null);
    const { context } = createContext({
      type: "threadList",
      title: "https://example.com/board/",
      boardUrl: "https://example.com/board/",
      boardTitle: "https://example.com/board/",
    });

    await expect(executeBrowserCommand("page.retry-board-title", context)).rejects.toThrow(
      "板名を取得できませんでした: https://example.com/board/",
    );
  });

  it("拡張機能でだけ開いているスレタブの取り込みコマンドを表示する", () => {
    const { context } = createContext({ type: "home", title: "ホーム" });

    expect(resolveBrowserCommands(context).map(({ id }) => id)).toContain(
      "navigation.import-open-thread-tabs",
    );

    vi.stubGlobal("browser", {
      runtime: { id: "tauri" },
      tabs: { query: queryTabsMock, remove: removeTabsMock },
    });
    expect(resolveBrowserCommands(context).map(({ id }) => id)).not.toContain(
      "navigation.import-open-thread-tabs",
    );
  });

  it("ブラウザで開いている互換スレだけを重複排除して取り込む", async () => {
    queryTabsMock.mockResolvedValue([
      {
        id: 101,
        url: "https://egg.5ch.net/test/read.cgi/software/123/",
        title: "スレッドA",
      },
      {
        id: 102,
        url: "https://egg.5ch.net/test/read.cgi/software/123/50",
        title: "スレッドA（途中）",
      },
      {
        id: 103,
        url: "https://jbbs.shitaraba.net/bbs/read.cgi/computer/456/789/",
        title: "スレッドB",
      },
      { id: 104, url: "https://egg.5ch.net/software/", title: "板トップ" },
      { id: 105, url: "https://example.com/article", title: "一般ページ" },
      { id: 106, url: "chrome://extensions/", title: "拡張機能" },
    ]);
    const { context, dispatch } = createContext({
      type: "thread",
      title: "スレッドA",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });

    await expect(
      executeBrowserCommand("navigation.import-open-thread-tabs", context),
    ).resolves.toBe(true);

    expect(queryTabsMock).toHaveBeenCalledWith({});
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "OPEN_IN_NEW_TAB",
      background: true,
      page: {
        type: "thread",
        title: "スレッドB",
        threadUrl: "https://jbbs.shitaraba.net/bbs/read.cgi/computer/456/789/",
      },
    });
    expect(removeTabsMock).toHaveBeenCalledTimes(1);
    expect(removeTabsMock).toHaveBeenCalledWith(103);
    expect(toastSuccessMock).toHaveBeenCalledWith("1件のスレタブを取り込みました");
  });

  it("同じURLの元タブをまとめて取り込み、取り込み後にすべて閉じる", async () => {
    queryTabsMock.mockResolvedValue([
      {
        id: 201,
        url: "https://egg.5ch.net/test/read.cgi/software/123/",
        title: "スレッドA",
      },
      {
        id: 202,
        url: "https://egg.5ch.net/test/read.cgi/software/123/50",
        title: "スレッドA（途中）",
      },
    ]);
    const { context, dispatch } = createContext({ type: "home", title: "ホーム" });

    await expect(
      executeBrowserCommand("navigation.import-open-thread-tabs", context),
    ).resolves.toBe(true);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "OPEN_IN_NEW_TAB",
      background: true,
      page: {
        type: "thread",
        title: "スレッドA",
        threadUrl: "https://egg.5ch.io/test/read.cgi/software/123/",
      },
    });
    expect(removeTabsMock.mock.calls.map(([tabId]) => tabId)).toEqual([201, 202]);
    expect(toastSuccessMock).toHaveBeenCalledWith("1件のスレタブを取り込みました");
  });

  it("元タブのクローズに部分失敗しても残りの取り込みを続ける", async () => {
    queryTabsMock.mockResolvedValue([
      {
        id: 301,
        url: "https://egg.5ch.net/test/read.cgi/software/123/",
        title: "スレッドA",
      },
      {
        id: 302,
        url: "https://jbbs.shitaraba.net/bbs/read.cgi/computer/456/789/",
        title: "スレッドB",
      },
    ]);
    removeTabsMock.mockRejectedValueOnce(new Error("タブは既に閉じられています"));
    const { context, dispatch } = createContext({ type: "home", title: "ホーム" });

    await expect(
      executeBrowserCommand("navigation.import-open-thread-tabs", context),
    ).resolves.toBe(true);

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(removeTabsMock.mock.calls.map(([tabId]) => tabId)).toEqual([301, 302]);
    expect(toastErrorMock).toHaveBeenCalledWith(
      "2件のスレタブを取り込みましたが、元ブラウザタブ1件を閉じられませんでした",
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("元タブIDを取得できないページは取り込まず閉じない", async () => {
    queryTabsMock.mockResolvedValue([
      {
        url: "https://egg.5ch.net/test/read.cgi/software/123/",
        title: "スレッドA",
      },
    ]);
    const { context, dispatch } = createContext({ type: "home", title: "ホーム" });

    await expect(
      executeBrowserCommand("navigation.import-open-thread-tabs", context),
    ).resolves.toBe(true);

    expect(dispatch).not.toHaveBeenCalled();
    expect(removeTabsMock).not.toHaveBeenCalled();
    expect(toastInfoMock).toHaveBeenCalledWith("取り込める新しいスレタブはありません");
  });

  it("スレッドではsubject.txtとdat、板ではsubject.txtだけを表示する", () => {
    const thread = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    }).context;
    const board = createContext({
      type: "threadList",
      title: "Software",
      boardTitle: "Software",
      boardUrl: "https://egg.5ch.net/software/",
    }).context;

    const threadIds = resolveBrowserCommands(thread).map(({ id }) => id);
    const boardIds = resolveBrowserCommands(board).map(({ id }) => id);

    expect(threadIds).toContain("copy.subject-url");
    expect(threadIds).toContain("copy.dat-url");
    expect(threadIds).toContain("copy.page-title-url-markdown");
    expect(threadIds).toContain("copy.thread-toon");
    expect(boardIds).toContain("copy.subject-url");
    expect(boardIds).not.toContain("copy.page-title-url-markdown");
    expect(boardIds).not.toContain("copy.dat-url");
    expect(boardIds).not.toContain("copy.thread-toon");
  });

  it("5ch・したらば・まちBBSのraw URLを導出する", () => {
    const fiveChThread: Page = {
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    };
    const shitarabaThread: Page = {
      type: "thread",
      title: "Thread",
      threadUrl: "https://jbbs.shitaraba.net/bbs/read.cgi/computer/1234/5678/",
    };
    const machiThread: Page = {
      type: "thread",
      title: "Thread",
      threadUrl: "https://kanto.machi.to/bbs/read.cgi/kana/123/",
    };

    expect(getSubjectUrlForCommand(fiveChThread)).toBe("https://egg.5ch.io/software/subject.txt");
    expect(getDatUrlForCommand(fiveChThread)).toBe("https://egg.5ch.io/software/dat/123.dat");
    expect(getSubjectUrlForCommand(shitarabaThread)).toBe(
      "https://jbbs.shitaraba.net/computer/1234/subject.txt",
    );
    expect(getDatUrlForCommand(shitarabaThread)).toBe(
      "https://jbbs.shitaraba.net/bbs/rawmode.cgi/computer/1234/5678/",
    );
    expect(getSubjectUrlForCommand(machiThread)).toBe(
      "https://kanto.machi.to/bbs/offlaw.cgi/kana/",
    );
    expect(getDatUrlForCommand(machiThread)).toBe(
      "https://kanto.machi.to/bbs/offlaw.cgi/kana/123/",
    );
  });

  it("itestは実サーバーへ解決できる場合だけraw URLを公開する", () => {
    const page: Page = {
      type: "thread",
      title: "Thread",
      threadUrl: "https://itest.5ch.io/test/read.cgi/software/123/",
    };

    expect(getSubjectUrlForCommand(page)).toBeNull();
    expect(getDatUrlForCommand(page)).toBeNull();

    setItestServerMapForTesting([["software", "egg.5ch.io"]]);
    expect(getSubjectUrlForCommand(page)).toBe("https://egg.5ch.io/software/subject.txt");
    expect(getDatUrlForCommand(page)).toBe("https://egg.5ch.io/software/dat/123.dat");
  });

  it("実行直前にも条件を確認し、条件外コマンドを実行しない", async () => {
    const { context } = createContext({
      type: "threadList",
      title: "Software",
      boardTitle: "Software",
      boardUrl: "https://egg.5ch.net/software/",
    });

    await expect(executeBrowserCommand("copy.dat-url", context)).resolves.toBe(false);
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it("コピーコマンドは導出したURLをコピーして成功を通知する", async () => {
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });

    await expect(executeBrowserCommand("copy.dat-url", context)).resolves.toBe(true);
    expect(copyTextMock).toHaveBeenCalledWith("https://egg.5ch.io/software/dat/123.dat");
    expect(toastSuccessMock).toHaveBeenCalledWith("datのURLをコピーしました");
  });

  it("Markdown形式のスレタイとURLを専用コマンドでコピーする", async () => {
    const { context } = createContext({
      type: "thread",
      title: "Title ] \\ note",
      threadUrl: "https://example.test/thread/(1)?next=2)",
    });

    await expect(executeBrowserCommand("copy.page-title-url-markdown", context)).resolves.toBe(
      true,
    );

    expect(copyTextMock).toHaveBeenCalledWith(
      "[Title \\] \\\\ note](https://example.test/thread/\\(1\\)?next=2\\))",
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Markdownリンクをコピーしました");
  });

  it("スレ全体をTOON形式でコピーし、推定トークン数を通知する", async () => {
    const threadUrl = "https://egg.5ch.net/test/read.cgi/software/123/";
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl,
    });

    await expect(executeBrowserCommand("copy.thread-toon", context)).resolves.toBe(true);

    expect(getThreadMock).toHaveBeenCalledWith(threadUrl);
    expect(encodeThreadAsToonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Thread",
        url: threadUrl,
      }),
    );
    expect(copyTextMock).toHaveBeenCalledWith("title: Thread");
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "スレ全体をTOON形式でコピーしました（推定 1,234 トークン）",
    );
  });

  it("2ペイン切り替えは現在の表示状態に応じたactionを送る", async () => {
    const { context, dispatch } = createContext({
      type: "home",
      title: "ホーム",
    });

    await executeBrowserCommand("layout.toggle-pane", context);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "SPLIT_PANE" });

    context.isTwoPane = true;
    await executeBrowserCommand("layout.toggle-pane", context);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "CLOSE_PANE" });
  });
});
