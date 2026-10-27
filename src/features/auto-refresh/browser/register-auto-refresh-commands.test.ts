import { container } from "src/service-container";
import { stubService } from "src/service-container/test-stubs";
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
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { Page, Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { registerAutoRefreshCommands } from "./register-auto-refresh-commands";

vi.mock("webextension-polyfill", () => ({ default: {} }));

function createContext(page: Page): BrowserCommandContext {
  const tab = {
    id: "auto-refresh-command-test",
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
  };
}

describe("自動更新コマンド登録", () => {
  let coreOwner: ExtensionOwner;
  let featureOwner: ExtensionOwner;

  beforeEach(() => {
    coreOwner = createExtensionOwner("core-test", browserCommandRegistry);
    registerCoreCommands(coreOwner.api);
    featureOwner = createExtensionOwner("auto-refresh-test", browserCommandRegistry);
    registerAutoRefreshCommands(featureOwner.api);
    container.config = stubService<typeof container.config>("config", {
      get: vi.fn(() => "off"),
      set: vi.fn(),
      ready: vi.fn(),
      getAll: () => ({}),
    });
  });

  afterEach(() => {
    featureOwner.dispose();
    coreOwner.dispose();
  });

  it("対象ページで表示状態を反転し、従来どおりの更新actionを送る", async () => {
    const page: Page = {
      type: "threadList",
      title: "板",
      boardUrl: "https://example.com/board/",
      boardTitle: "板",
    };
    const context = createContext(page);
    const command = resolveBrowserCommands(context).find(({ id }) => id === "auto-refresh.toggle");

    expect(command?.englishLabel).toBe("Start Auto Refresh");
    await expect(executeBrowserCommand("auto-refresh.toggle", context)).resolves.toBe(true);
    expect(context.dispatch).toHaveBeenCalledWith(
      tabActions.setAutoRefreshEnabled(true, "threadList:https://example.com/board/"),
    );
  });

  it("更新できないページでは表示せず、直接実行も拒否する", async () => {
    const context = createContext({ type: "boardList", title: "ホーム" });

    expect(resolveBrowserCommands(context).some(({ id }) => id === "auto-refresh.toggle")).toBe(
      false,
    );
    await expect(executeBrowserCommand("auto-refresh.toggle", context)).resolves.toBe(false);
  });
});
