import { afterEach, describe, expect, it, vi } from "vitest";

const { bookmarksGetMock } = vi.hoisted(() => ({
  bookmarksGetMock: vi.fn(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    bookmarks: {
      get: bookmarksGetMock,
    },
  },
}));

import { readBookmarkFolderName } from "src/view/browser/utils/bookmark-root";

describe("readBookmarkFolderName", () => {
  afterEach(() => {
    bookmarksGetMock.mockReset();
  });

  it("children が未展開でもフォルダを有効と判定する", async () => {
    bookmarksGetMock.mockResolvedValue([
      {
        id: "3",
        title: "read.crx",
      },
    ]);

    await expect(readBookmarkFolderName("3")).resolves.toBe("read.crx");
  });

  it("URLを持つブックマーク項目は保存先フォルダとして扱わない", async () => {
    bookmarksGetMock.mockResolvedValue([
      {
        id: "99",
        title: "thread",
        url: "https://example.com/thread",
      },
    ]);

    await expect(readBookmarkFolderName("99")).resolves.toBeNull();
  });
});
