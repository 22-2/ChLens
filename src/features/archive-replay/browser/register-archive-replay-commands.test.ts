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
import type { Page, Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { registerArchiveReplayCommands } from "./register-archive-replay-commands";

vi.mock("webextension-polyfill", () => ({ default: {} }));

function createContext(page: Page): BrowserCommandContext {
  const tab = {
    id: "archive-replay-command-test",
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
  };
}

describe("過去実況再生コマンド登録", () => {
  let coreOwner: ExtensionOwner;
  let featureOwner: ExtensionOwner;

  beforeEach(() => {
    coreOwner = createExtensionOwner("core-test", browserCommandRegistry);
    registerCoreCommands(coreOwner.api);
    featureOwner = createExtensionOwner("archive-replay-test", browserCommandRegistry);
    registerArchiveReplayCommands(featureOwner.api);
    container.config = stubService<typeof container.config>("config", {
      get: vi.fn(() => "off"),
      set: vi.fn(),
      ready: vi.fn(),
      getAll: () => ({}),
    });
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    featureOwner.dispose();
    coreOwner.dispose();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("通常のブラウザ環境ではコマンドを出さず、直接実行も拒否する", async () => {
    const context = createContext({ type: "boardList", title: "ホーム" });

    expect(resolveBrowserCommands(context).some(({ id }) => id === "archive-replay.open")).toBe(
      false,
    );
    await expect(executeBrowserCommand("archive-replay.open", context)).resolves.toBe(false);
    expect(context.openArchiveReplayWindow).not.toHaveBeenCalled();
  });

  it("Tauriではコマンドを表示し、過去実況再生窓を開く", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const context = createContext({ type: "boardList", title: "ホーム" });
    const ids = resolveBrowserCommands(context).map(({ id }) => id);

    expect(ids.indexOf("archive-replay.open")).toBe(ids.indexOf("navigation.open-siki-log") - 1);
    expect(ids).toContain("archive-replay.open");
    await expect(executeBrowserCommand("archive-replay.open", context)).resolves.toBe(true);
    expect(context.openArchiveReplayWindow).toHaveBeenCalledOnce();
  });
});
