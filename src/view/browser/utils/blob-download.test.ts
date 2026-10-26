import { downloadBlob } from "src/view/browser/utils/blob-download";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

describe("Blobのダウンロード", () => {
  let originalCreateObjectURL: PropertyDescriptor | undefined;
  let originalRevokeObjectURL: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:download-test"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("指定名で保存し、一時URLを解放する", () => {
    const blob = new Blob(["content"], { type: "text/plain" });
    const createObjectURL = vi.mocked(URL.createObjectURL);
    const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    click.mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe("blob:download-test");
      expect(this.download).toBe("export.txt");
    });

    downloadBlob(blob, "export.txt");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download-test");
  });

  it("クリックに失敗しても一時URLを解放する", () => {
    const error = new Error("download failed");
    const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    click.mockImplementation(() => {
      throw error;
    });

    expect(() => downloadBlob(new Blob(["content"]), "export.txt")).toThrow(error);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download-test");
  });
});
