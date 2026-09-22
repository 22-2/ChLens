import { copyText } from "src/view/browser/utils/clipboard";
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
});
