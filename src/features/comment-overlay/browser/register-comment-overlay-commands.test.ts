import type {
  BrowserCommandContext,
  BrowserCommandDefinition,
} from "src/view/browser/commands/command-definition";
import { CommandRegistry } from "src/view/browser/extension/command-registry";
import { createExtensionOwner } from "src/view/browser/extension/extension-api";
import { createHomeTab, type Page } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { registerCommentOverlayCommands } from "./register-comment-overlay-commands";

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  snapshot: vi.fn(() => ({ state: { status: "idle" }, visible: false })),
  start: vi.fn(async (_url: string) => undefined),
  stop: vi.fn(async () => undefined),
  setVisible: vi.fn(async (_visible: boolean) => undefined),
  error: vi.fn(),
}));
vi.mock("src/app/platform/runtime", () => ({ isTauriRuntime: mocks.isTauri }));
vi.mock("src/app/logger", () => ({ createLogger: () => ({ error: mocks.error, warn: vi.fn() }) }));
vi.mock("src/features/comment-overlay/application", () => ({
  commentOverlayController: {
    getSnapshot: mocks.snapshot,
    start: mocks.start,
    stop: mocks.stop,
    setVisible: mocks.setVisible,
  },
}));

function context(page: Page): BrowserCommandContext {
  const tab = { ...createHomeTab("tab-1"), history: [page] };
  return {
    workspace: { openPage: () => "executed" },
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

describe("コメント実況コマンド", () => {
  const registry = new CommandRegistry<BrowserCommandDefinition>();
  let owner: ReturnType<typeof createExtensionOwner>;
  beforeEach(() => {
    mocks.isTauri.mockReturnValue(true);
    mocks.snapshot.mockReturnValue({ state: { status: "idle" }, visible: false });
    mocks.start.mockReset().mockResolvedValue(undefined);
    mocks.stop.mockReset().mockResolvedValue(undefined);
    mocks.setVisible.mockReset().mockResolvedValue(undefined);
    mocks.error.mockClear();
    owner = createExtensionOwner("comment-overlay", registry);
    registerCommentOverlayCommands(owner.api);
  });
  afterEach(() => owner.dispose());

  it("Tauri のときだけ表示し、所有者の解除で登録を消す", () => {
    const command = registry.getSnapshot()[0];
    expect(command.id).toBe("comment-overlay.toggle");
    expect(command.label).toBe("コメント実況を切り替え");
    expect(command.when?.(context({ type: "home", title: "ホーム" }))).toBe(true);
    mocks.isTauri.mockReturnValue(false);
    expect(command.when?.(context({ type: "home", title: "ホーム" }))).toBe(false);
    owner.dispose();
    expect(registry.getSnapshot()).toHaveLength(0);
  });

  it("停止中は実行元のスレを開始し、スレ以外では開始しない", async () => {
    const command = registry.getSnapshot()[0];
    await command.run(
      context({
        type: "thread",
        title: "スレ",
        threadUrl: "https://example.com/test/read.cgi/board/123/",
      }),
    );
    expect(mocks.start).toHaveBeenCalledWith("https://example.com/test/read.cgi/board/123/");
    await command.run(context({ type: "home", title: "ホーム" }));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("実行中はページに関係なく表示状態に応じて停止または再表示する", async () => {
    const command = registry.getSnapshot()[0];
    const page = context({ type: "home", title: "ホーム" });
    mocks.snapshot.mockReturnValue({ state: { status: "running" }, visible: true });
    await command.run(page);
    expect(mocks.stop).toHaveBeenCalledOnce();
    mocks.snapshot.mockReturnValue({ state: { status: "running" }, visible: false });
    await command.run(page);
    expect(mocks.setVisible).toHaveBeenCalledWith(true);
  });

  it("非同期処理の失敗をログに残す", async () => {
    const failure = new Error("開始できません");
    mocks.start.mockRejectedValueOnce(failure);
    await registry.getSnapshot()[0].run(
      context({
        type: "thread",
        title: "スレ",
        threadUrl: "https://example.com/test/read.cgi/board/123/",
      }),
    );
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.any(String), failure));
  });
});
