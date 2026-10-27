import { container } from "src/service-container";
import type { IToastService } from "src/service-container/interfaces";
import { registerTestFilterCommands } from "src/test-support/filter-commands";
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

vi.mock("webextension-polyfill", () => ({ default: {} }));

import { registerMediaCommands } from "./register-media-commands";

const getDeletableImageUrls = vi.fn();
const deleteImages = vi.fn();
const toast = {
  notify: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
} satisfies IToastService;

function createContext(page: Page): BrowserCommandContext {
  const tab = {
    id: "media-command-test",
    history: [page],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  } as Tab;
  return {
    workspace: { openPage: vi.fn(() => "executed" as const) },
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

describe("メディア機能のコマンド登録", () => {
  let coreOwner: ExtensionOwner;
  let featureOwner: ExtensionOwner;

  beforeEach(() => {
    // アプリ起動時と同じく、表示順の基準になる core のコマンドを先に登録する。
    coreOwner = createExtensionOwner("core-test", browserCommandRegistry);
    registerCoreCommands(coreOwner.api);
    registerTestFilterCommands(coreOwner.api);
    featureOwner = createExtensionOwner("media-test", browserCommandRegistry);
    registerMediaCommands(featureOwner.api);
    getDeletableImageUrls.mockResolvedValue(["https://example.com/uploaded-image.png"]);
    deleteImages.mockResolvedValue({ deletedCount: 1, skippedCount: 0, failures: [] });
    container.imgurImages = { getDeletableImageUrls, deleteImages };
    container.toast = toast;
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    featureOwner.dispose();
    coreOwner.dispose();
    vi.restoreAllMocks();
    getDeletableImageUrls.mockReset();
    deleteImages.mockReset();
  });

  it("全投稿画像の削除コマンドをmedia所有者から登録して確認を挟む", async () => {
    const context = createContext({ type: "boardList", title: "ホーム" });

    await expect(executeBrowserCommand("media.delete-all-imgur-images", context)).resolves.toBe(
      true,
    );

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("Imgur画像 1 件を削除します。元に戻せません"),
    );
    expect(getDeletableImageUrls).toHaveBeenCalledWith(undefined);
    expect(deleteImages).toHaveBeenCalledWith(["https://example.com/uploaded-image.png"]);
    expect(toast.success).toHaveBeenCalledWith("Imgur画像を 1 件削除しました");
  });

  it("スレ内の削除対象は保存済みログから読み、スレを再取得しない", async () => {
    const threadUrl = "https://example.com/test/read.cgi/board/123/";
    const getCache = vi.fn((path: string) => {
      expect(path).toContain("123.dat");
      return {
        get: vi.fn(async () => undefined),
        data: null,
        parsed: { res: [{ message: "https://example.com/uploaded-image.png" }] },
        lastUpdated: 1,
        put: vi.fn(async () => undefined),
      };
    });
    container.config = {
      get: (key) => (key === "format_2chnet" ? "dat" : null),
      set: vi.fn(),
      ready: vi.fn(),
      getAll: () => ({}),
    };
    container.cache = { getCache };
    const context = createContext({ type: "thread", title: "Test", threadUrl });

    await expect(executeBrowserCommand("media.delete-thread-imgur-images", context)).resolves.toBe(
      true,
    );

    expect(getCache).toHaveBeenCalledOnce();
    expect(getDeletableImageUrls).toHaveBeenCalledWith(["https://example.com/uploaded-image.png"]);
    expect(deleteImages).toHaveBeenCalledWith(["https://example.com/uploaded-image.png"]);
  });
});
