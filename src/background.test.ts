import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type MessageSender = { tab?: { id?: number } };
type MessageListener = (message: unknown, sender: MessageSender) => void;

const backgroundMocks = vi.hoisted(() => ({
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test-extension${path}`),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    sendMessage: vi.fn(),
    remove: vi.fn(),
    onCreated: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
  },
  windows: {
    getCurrent: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  action: { onClicked: { addListener: vi.fn() } },
}));

vi.mock("webextension-polyfill", () => ({
  default: backgroundMocks,
}));

describe("background", () => {
  let messageListener: MessageListener | undefined;

  beforeAll(async () => {
    backgroundMocks.runtime.onMessage.addListener.mockImplementation(
      (listener: MessageListener) => {
        messageListener = listener;
      },
    );
    await import("src/background");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    backgroundMocks.tabs.query.mockResolvedValue([
      {
        id: 900,
        url: "chrome-extension://test-extension/view/index.html",
        windowId: 12,
      },
    ]);
    backgroundMocks.tabs.sendMessage.mockResolvedValue(undefined);
    backgroundMocks.tabs.get.mockResolvedValue({ id: 900, windowId: 12 });
    backgroundMocks.tabs.update.mockResolvedValue(undefined);
    backgroundMocks.windows.update.mockResolvedValue(undefined);
    backgroundMocks.tabs.remove.mockResolvedValue(undefined);
  });

  it("コンテンツスクリプトから開いた元タブをChLens側の処理後に閉じる", async () => {
    if (!messageListener) throw new Error("背景メッセージリスナーが登録されていません");

    messageListener(
      {
        type: "open-in-new-viewer-tab",
        url: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1788019282/",
      },
      { tab: { id: 321 } },
    );

    await vi.waitFor(() => {
      expect(backgroundMocks.tabs.remove).toHaveBeenCalledWith(321);
    });
    expect(backgroundMocks.tabs.sendMessage).toHaveBeenCalledWith(900, {
      type: "open-tab-in-viewer",
      url: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1788019282/",
    });
  });

  it("ChLens側の処理に失敗した場合は元タブを閉じない", async () => {
    if (!messageListener) throw new Error("背景メッセージリスナーが登録されていません");
    backgroundMocks.tabs.sendMessage.mockRejectedValueOnce(new Error("ビューアーに接続できません"));

    messageListener(
      {
        type: "open-in-new-viewer-tab",
        url: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1788019282/",
      },
      { tab: { id: 322 } },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(backgroundMocks.tabs.remove).not.toHaveBeenCalled();
  });
});
