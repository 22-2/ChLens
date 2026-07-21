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
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

const { copyTextMock, toastSuccessMock } = vi.hoisted(() => ({
  copyTextMock: vi.fn<() => Promise<void>>(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("src/view/browser/utils/utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("src/view/browser/utils/utils")>();
  return { ...actual, copyText: copyTextMock };
});

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

function createContext(page: Page): {
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
      isTwoPane: false,
      isWritePanelOpen: false,
      dispatch,
      toggleWritePanel: vi.fn(),
    },
    dispatch,
  };
}

describe("browser commands", () => {
  beforeEach(() => {
    copyTextMock.mockResolvedValue();
    container.toast = {
      notify: vi.fn(),
      success: toastSuccessMock,
      error: vi.fn(),
      info: vi.fn(),
    };
  });

  afterEach(() => {
    copyTextMock.mockReset();
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
    expect(boardIds).toContain("copy.subject-url");
    expect(boardIds).not.toContain("copy.dat-url");
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

    expect(getSubjectUrlForCommand(fiveChThread)).toBe(
      "https://egg.5ch.net/software/subject.txt",
    );
    expect(getDatUrlForCommand(fiveChThread)).toBe(
      "https://egg.5ch.net/software/dat/123.dat",
    );
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
    expect(getSubjectUrlForCommand(page)).toBe(
      "https://egg.5ch.io/software/subject.txt",
    );
    expect(getDatUrlForCommand(page)).toBe(
      "https://egg.5ch.io/software/dat/123.dat",
    );
  });

  it("実行直前にも条件を確認し、条件外コマンドを実行しない", async () => {
    const { context } = createContext({
      type: "threadList",
      title: "Software",
      boardTitle: "Software",
      boardUrl: "https://egg.5ch.net/software/",
    });

    await expect(executeBrowserCommand("copy.dat-url", context)).resolves.toBe(
      false,
    );
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it("コピーコマンドは導出したURLをコピーして成功を通知する", async () => {
    const { context } = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    });

    await expect(executeBrowserCommand("copy.dat-url", context)).resolves.toBe(
      true,
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      "https://egg.5ch.net/software/dat/123.dat",
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("datのURLをコピーしました");
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
