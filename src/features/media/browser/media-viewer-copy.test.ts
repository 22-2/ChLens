import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { fetchBinaryMock } = vi.hoisted(() => ({ fetchBinaryMock: vi.fn() }));
vi.mock("src/app/platform", () => ({ platform: { http: { fetchBinary: fetchBinaryMock } } }));

import { createViewerClipboardPng } from "./media-viewer-copy";

describe("メディアビューアの画像コピー", () => {
  const surface = { window, document };

  afterEach(() => {
    fetchBinaryMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("PNG画像をバイナリのままコピーに渡す", async () => {
    fetchBinaryMock.mockResolvedValue({
      status: 200,
      headers: { "Content-Type": "image/png" },
      body: new Uint8Array([137, 80, 78, 71]).buffer,
    });

    const result = await createViewerClipboardPng("https://example.com/image.png", surface);

    expect(result.type).toBe("image/png");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(fetchBinaryMock).toHaveBeenCalledWith(
      "https://example.com/image.png",
      expect.objectContaining({ httpsMode: "auto" }),
    );
  });

  it("JPEGをPNGに変換して表示画面のクリップボードへ渡す", async () => {
    fetchBinaryMock.mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/jpeg; charset=binary" },
      body: new Uint8Array([255, 216, 255]).buffer,
    });
    const bitmap = { width: 2, height: 3, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });

    const result = await createViewerClipboardPng("https://example.com/image.jpg", surface);

    expect(result.type).toBe("image/png");
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("代替表示のblob URLは同じ画面から読み、再ダウンロードしない", async () => {
    const png = new Blob(["png"], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => png });
    vi.spyOn(window, "fetch").mockImplementation(fetchMock);

    await expect(createViewerClipboardPng("blob:https://example.com/image", surface)).resolves.toBe(
      png,
    );
    expect(fetchBinaryMock).not.toHaveBeenCalled();
  });

  it("画像取得に失敗した場合はコピーを成功扱いにしない", async () => {
    fetchBinaryMock.mockResolvedValue({ status: 404, headers: {}, body: new ArrayBuffer(0) });

    await expect(
      createViewerClipboardPng("https://example.com/missing.png", surface),
    ).rejects.toThrow("404");
  });
});
