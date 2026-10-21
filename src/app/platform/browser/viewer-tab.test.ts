// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  create: vi.fn<(options: unknown) => Promise<{ id?: number }>>(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    tabs: {
      create: mocks.create,
    },
  },
}));

import { createViewerTab } from "./viewer-tab";

const viewerUrl = "chrome-extension://test-extension/view/index.html";

describe("ビューアーの起動タブ", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.create.mockResolvedValue({ id: 42 });
  });

  it("作成と同時にタブを選択する", async () => {
    await expect(createViewerTab(viewerUrl, 7)).resolves.toEqual({ id: 42 });
    expect(mocks.create).toHaveBeenCalledWith({ url: viewerUrl, active: true, windowId: 7 });
  });

  it("タブIDが返らない場合はエラーにする", async () => {
    mocks.create.mockResolvedValue({});
    await expect(createViewerTab(viewerUrl)).rejects.toThrow(
      "作成したビューアータブのIDがありません",
    );
  });
});
