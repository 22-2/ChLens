import { container } from "src/service-container";
import type { IToastService } from "src/service-container/interfaces";
import { stubService } from "src/service-container/test-stubs";
import {
  browserCommandRegistry,
  executeBrowserCommand,
  registerCoreCommands,
} from "src/view/browser/commands/browser-commands";
import type { BrowserCommandContext } from "src/view/browser/commands/command-definition";
import {
  createExtensionOwner,
  type ExtensionOwner,
} from "src/view/browser/extension/extension-api";
import type { Page, Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { registerBookmarkCommands } from "./register-bookmark-commands";

vi.mock("webextension-polyfill", () => ({ default: {} }));

const bookmarkGet = vi.fn();
const bookmarkAdd = vi.fn();
const bookmarkRemove = vi.fn();
const toast = {
  notify: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
} satisfies IToastService;

function createContext(page: Page): BrowserCommandContext {
  const tab = {
    id: "bookmark-command-test",
    history: [page],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  } as Tab;
  return {
    viewPage: page,
    viewTab: tab,
    tabs: [tab],
    closedTabs: [],
    isTwoPane: false,
    isWritePanelOpen: false,
    clearCachedThreadReadState: async () => undefined,
    dispatch: vi.fn(),
    toggleWritePanel: vi.fn(),
    openResponseJumpDialog: vi.fn(),
    openNextThreadSearchDialog: async () => undefined,
    openArchiveReplayWindow: vi.fn(),
    toast,
  };
}

describe("お気に入りコマンド登録", () => {
  let coreOwner: ExtensionOwner;
  let featureOwner: ExtensionOwner;

  beforeEach(() => {
    // アプリ起動時と同じく、表示順の基準になる core のコマンドを先に登録する。
    coreOwner = createExtensionOwner("core-test", browserCommandRegistry);
    registerCoreCommands(coreOwner.api);
    featureOwner = createExtensionOwner("bookmark-test", browserCommandRegistry);
    registerBookmarkCommands(featureOwner.api);
    bookmarkGet.mockReturnValue(null);
    bookmarkAdd.mockResolvedValue(undefined);
    bookmarkRemove.mockResolvedValue(undefined);
    container.bookmark = stubService<typeof container.bookmark>("bookmark", {
      get: bookmarkGet,
      add: bookmarkAdd,
      remove: bookmarkRemove,
    });
    container.toast = toast;
  });

  afterEach(() => {
    featureOwner.dispose();
    coreOwner.dispose();
    vi.restoreAllMocks();
    bookmarkGet.mockReset();
    bookmarkAdd.mockReset();
    bookmarkRemove.mockReset();
  });

  it("現在ページのブックマーク切り替えを共通の対象コマンドへ渡す", async () => {
    const threadUrl = "https://example.com/test/read.cgi/board/123/";
    const context = createContext({ type: "thread", title: "Thread", threadUrl });

    await expect(executeBrowserCommand("bookmark.toggle", context)).resolves.toBe(true);

    expect(bookmarkAdd).toHaveBeenCalledWith({ url: threadUrl, title: "Thread", type: "thread" });
    expect(toast.info).toHaveBeenCalledWith("ブックマークに追加しました");
  });

  it("ブックマークリストを現在のタブで開く", async () => {
    const context = createContext({ type: "boardList", title: "ホーム" });

    await expect(executeBrowserCommand("bookmark.open-list", context)).resolves.toBe(true);

    expect(context.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ page: expect.objectContaining({ type: "bookmarkList" }) }),
    );
  });
});
