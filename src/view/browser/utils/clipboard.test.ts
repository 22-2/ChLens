import type { IToastService } from "src/service-container/interfaces";
import {
  copyImageWithNotice,
  copyPngImageWithNotice,
  copyText,
} from "src/view/browser/utils/clipboard";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

function createDetachedSurface(writeText: () => Promise<void>) {
  const detachedDocument = document.implementation.createHTMLDocument("detached");
  const detachedWindow = Object.create(window) as Window;
  Object.defineProperty(detachedWindow, "navigator", {
    configurable: true,
    value: { clipboard: { writeText } } as unknown as Navigator,
  });
  return { detachedDocument, detachedWindow };
}

describe("clipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("別窓のnavigator.clipboardへコピーする", async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { detachedDocument, detachedWindow } = createDetachedSurface(writeText);
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(detachedDocument, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await copyText("別窓のテキスト", {
      window: detachedWindow,
      document: detachedDocument,
    });

    expect(writeText).toHaveBeenCalledWith("別窓のテキスト");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("フォールバック失敗時は一時DOMを残さず例外を返す", async () => {
    const writeText = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("APIなし"));
    const { detachedDocument, detachedWindow } = createDetachedSurface(writeText);
    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(detachedDocument, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await expect(
      copyText("コピー失敗", {
        window: detachedWindow,
        document: detachedDocument,
      }),
    ).rejects.toThrow("クリップボードへのコピーに失敗しました");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(detachedDocument.body.childElementCount).toBe(0);
  });

  it("画像のコピー成功時にtoastを表示する", async () => {
    const detachedWindow = Object.create(window) as Window & typeof globalThis;
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(detachedWindow, "navigator", {
      configurable: true,
      value: { clipboard: { write } } as unknown as Navigator,
    });
    Object.defineProperty(detachedWindow, "ClipboardItem", {
      configurable: true,
      value: class ClipboardItemMock {
        constructor(_items: Record<string, Blob>) {}
      },
    });
    const toastSuccess = vi.fn();
    const toast: IToastService = {
      notify: vi.fn(),
      success: toastSuccess,
      error: vi.fn(),
      info: vi.fn(),
    };

    await copyImageWithNotice(
      async () => new Blob(["image"], { type: "image/png" }),
      { window: detachedWindow, document },
      toast,
      "レス画像",
    );

    expect(write).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("レス画像をコピーしました");
  });

  it("PNGの生成を待つ間も別窓のクリップボードへコピー要求を渡す", async () => {
    const detachedWindow = Object.create(window) as Window & typeof globalThis;
    let resolvePng: ((blob: Blob) => void) | undefined;
    const createPng = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolvePng = resolve;
        }),
    );
    const write = vi.fn(async (items: { data: Record<string, Promise<Blob>> }[]) => {
      expect(await items[0]?.data["image/png"]).toBeInstanceOf(Blob);
    });
    Object.defineProperty(detachedWindow, "navigator", {
      configurable: true,
      value: { clipboard: { write } } as unknown as Navigator,
    });
    Object.defineProperty(detachedWindow, "ClipboardItem", {
      configurable: true,
      value: class ClipboardItemMock {
        constructor(public readonly data: Record<string, Promise<Blob>>) {}
      },
    });
    const toast: IToastService = {
      notify: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    const operation = copyPngImageWithNotice(
      createPng,
      { window: detachedWindow, document },
      toast,
      "画像",
    );
    expect(write).toHaveBeenCalledOnce();
    resolvePng?.(new Blob(["png"], { type: "image/png" }));
    await operation;
    expect(toast.success).toHaveBeenCalledWith("画像をコピーしました");
  });

  it("画像コピーの失敗時にtoastで知らせる", async () => {
    const toastSuccess = vi.fn();
    const toastError = vi.fn();
    const toast: IToastService = {
      notify: vi.fn(),
      success: toastSuccess,
      error: toastError,
      info: vi.fn(),
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await copyImageWithNotice(
      async () => {
        throw new Error("画像生成に失敗しました");
      },
      { window, document },
      toast,
      "レス画像",
    );

    expect(toastError).toHaveBeenCalledWith("レス画像をコピーできませんでした");
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
