import { cleanup, waitFor } from "@testing-library/react";
import { container } from "src/service-container";
import {
  createThreadBookmarkMenuItem,
  createThreadCopyMenuItems,
} from "src/view/browser/components/thread-context-menu-items";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const copyTextMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/clipboard")>();
  return { ...actual, copyText: copyTextMock };
});

const target = {
  title: "テストスレッド",
  url: "https://example.com/test/read.cgi/software/123/",
};

describe("thread-context-menu-items", () => {
  const bookmarkAddMock = vi.fn();
  const bookmarkRemoveMock = vi.fn();
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    copyTextMock.mockResolvedValue(undefined);
    bookmarkAddMock.mockReset();
    bookmarkRemoveMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    container.bookmark = {
      get: vi.fn(),
      add: bookmarkAddMock,
      remove: bookmarkRemoveMock,
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    copyTextMock.mockReset();
    consoleErrorSpy.mockRestore();
  });

  it("コピー項目を指定順で生成し、それぞれの形式を使う", () => {
    const items = createThreadCopyMenuItems(target);

    expect(items.map((item) => item.label)).toEqual([
      "スレタイをコピー",
      "URLをコピー",
      "スレタイ＆URLをコピー",
    ]);

    for (const item of items) {
      item.onSelect?.();
    }

    expect(copyTextMock).toHaveBeenNthCalledWith(1, target.title);
    expect(copyTextMock).toHaveBeenNthCalledWith(2, target.url);
    expect(copyTextMock).toHaveBeenNthCalledWith(3, `${target.title}\n${target.url}`);
  });

  it("非同期のブックマーク失敗もログへ送る", async () => {
    const error = new Error("保存に失敗しました");
    bookmarkAddMock.mockRejectedValue(error);
    const item = createThreadBookmarkMenuItem({ target, isBookmarked: false });

    item.onSelect?.();

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[ThreadMenu] ブックマークの更新に失敗しました",
        {
          error,
          url: target.url,
        },
      );
    });
  });
});
