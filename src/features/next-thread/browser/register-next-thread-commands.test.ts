import { container } from "src/service-container";
import { stubService } from "src/service-container/test-stubs";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import {
  browserCommandRegistry,
  executeBrowserCommand,
  registerCoreCommands,
  resolveBrowserCommands,
} from "src/view/browser/commands/browser-commands";
import type { BrowserCommandContext } from "src/view/browser/commands/command-definition";
import {
  createExtensionOwner,
  type ExtensionOwner,
} from "src/view/browser/extension/extension-api";
import type { Page, Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { registerNextThreadCommands } from "./register-next-thread-commands";

vi.mock("webextension-polyfill", () => ({ default: {} }));

function createContext(page: Page): BrowserCommandContext {
  const tab = {
    id: "next-thread-command-test",
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
    openNextThreadSearchDialog: vi.fn(async () => undefined),
    openRelatedThreadSearchDialog: vi.fn(async () => undefined),
    openArchiveReplayWindow: vi.fn(),
  };
}

describe("次スレコマンド登録", () => {
  let coreOwner: ExtensionOwner;
  let featureOwner: ExtensionOwner;
  const configSet = vi.fn();

  beforeEach(() => {
    coreOwner = createExtensionOwner("core-test", browserCommandRegistry);
    registerCoreCommands(coreOwner.api);
    featureOwner = createExtensionOwner("next-thread-test", browserCommandRegistry);
    registerNextThreadCommands(featureOwner.api);
    configSet.mockReset();
    container.config = stubService<typeof container.config>("config", {
      get: vi.fn(() => "off"),
      set: configSet,
      ready: vi.fn(),
      getAll: () => ({}),
    });
  });

  afterEach(() => {
    featureOwner.dispose();
    coreOwner.dispose();
  });

  it("次スレ検索コマンドを元の順序で表示し、画面の検索処理を呼ぶ", async () => {
    const context = createContext({
      type: "thread",
      title: "Thread",
      threadUrl: "https://example.com/test/read.cgi/board/123/",
    });
    const ids = resolveBrowserCommands(context).map(({ id }) => id);
    const nextIndex = ids.indexOf("next-thread.search");
    const relatedIndex = ids.indexOf("next-thread.search-related");
    const filterIndex = ids.indexOf("page.toggle-filter");

    expect(nextIndex).toBeGreaterThanOrEqual(0);
    expect(relatedIndex).toBe(nextIndex + 1);
    expect(filterIndex).toBe(relatedIndex + 1);
    await expect(executeBrowserCommand("next-thread.search", context)).resolves.toBe(true);
    await expect(executeBrowserCommand("next-thread.search-related", context)).resolves.toBe(true);
    expect(context.openNextThreadSearchDialog).toHaveBeenCalledOnce();
    expect(context.openRelatedThreadSearchDialog).toHaveBeenCalledOnce();
  });

  it("ホームではスレッド向け検索を表示せず実行も拒否する", async () => {
    const context = createContext({ type: "boardList", title: "ホーム" });

    expect(resolveBrowserCommands(context).map(({ id }) => id)).not.toContain("next-thread.search");
    await expect(executeBrowserCommand("next-thread.search", context)).resolves.toBe(false);
  });

  it("自動次スレ設定を既存の設定保存経路で切り替える", async () => {
    const context = createContext({ type: "boardList", title: "ホーム" });
    const command = resolveBrowserCommands(context).find(
      ({ id }) => id === "next-thread.toggle-auto",
    );

    expect(command?.englishLabel).toBe("Enable Auto Next Thread");
    await expect(executeBrowserCommand("next-thread.toggle-auto", context)).resolves.toBe(true);
    expect(configSet).toHaveBeenCalledWith("auto_next_thread", "on");
  });
});

setupTestPageTypes();
