import { container } from "src/service-container";
import {
  type CommandRuntime,
  executeCommandRequest,
  runCommandRequest,
} from "src/view/browser/commands/command-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const copyTextMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/clipboard")>();
  return { ...actual, copyText: copyTextMock };
});

const target = {
  kind: "thread" as const,
  title: "テストスレッド",
  url: "https://example.com/test/read.cgi/software/123/",
};

function createRuntime(): CommandRuntime {
  return {
    surface: { window, document },
    toast: {
      notify: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  };
}

describe("command-runtime", () => {
  beforeEach(() => {
    copyTextMock.mockResolvedValue(undefined);
    container.bookmark = {
      get: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
    };
  });

  afterEach(() => {
    copyTextMock.mockReset();
  });

  it("対象付きコピーは表示環境を渡して指定形式を変換する", async () => {
    const runtime = createRuntime();

    await executeCommandRequest(
      { id: "target.copy", args: { target, format: "markdown" } },
      runtime,
    );

    expect(copyTextMock).toHaveBeenCalledWith(`[${target.title}](${target.url})`, runtime.surface);
  });

  it("ブックマークsetは実行時の状態を確認して必要な場合だけ保存する", async () => {
    const add = vi.fn();
    const remove = vi.fn();
    const get = vi.fn().mockReturnValue(undefined);
    container.bookmark = {
      get,
      add,
      remove,
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
    };

    await executeCommandRequest(
      { id: "target.bookmark.set", args: { target, bookmarked: true } },
      createRuntime(),
    );
    expect(add).toHaveBeenCalledWith({
      url: target.url,
      title: target.title,
      type: "thread",
    });

    get.mockReturnValue(target);
    await executeCommandRequest(
      { id: "target.bookmark.set", args: { target, bookmarked: true } },
      createRuntime(),
    );
    expect(add).toHaveBeenCalledTimes(1);

    await executeCommandRequest(
      { id: "target.bookmark.toggle", args: { target } },
      createRuntime(),
    );
    expect(remove).toHaveBeenCalledWith(target.url);
  });

  it("UI向け入口は失敗をログと通知へ集約する", async () => {
    const error = new Error("コピーに失敗しました");
    copyTextMock.mockRejectedValue(error);
    const runtime = createRuntime();
    const toastErrorMock = vi.fn();
    runtime.toast.error = toastErrorMock;
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runCommandRequest({ id: "target.copy", args: { target, format: "title" } }, runtime),
    ).resolves.toBe(false);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "対象付きコマンドの実行に失敗しました",
      expect.objectContaining({ commandId: "target.copy", error }),
    );
    expect(toastErrorMock).toHaveBeenCalledWith("コピーに失敗しました");
    consoleErrorSpy.mockRestore();
  });
});
