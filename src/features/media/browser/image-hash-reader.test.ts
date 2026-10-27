// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { fetchBinary, isTauriRuntime } = vi.hoisted(() => ({
  fetchBinary: vi.fn(),
  isTauriRuntime: vi.fn(() => false),
}));

vi.mock("src/app/platform", () => ({ platform: { http: { fetchBinary } } }));
vi.mock("src/app/platform/runtime", () => ({ isTauriRuntime }));

import { IMAGE_HASH_CANVAS_SIZE } from "../domain/image-blockhash";
import { computeImageHashFromElement } from "./image-hash-reader";

const SIZE = IMAGE_HASH_CANVAS_SIZE;
// 左半分が白、右半分が黒のピクセル。ハッシュは "f0f0f0f0f0f0f0f0" になる。
const HALF_WHITE = (() => {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const value = x < SIZE / 2 ? 255 : 0;
      data.set([value, value, value, 255], (y * SIZE + x) * 4);
    }
  }
  return data;
})();

function fakeDocument(options: { taintedSources?: Set<unknown> } = {}) {
  const drawn: unknown[] = [];
  let lastSource: unknown;
  const document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: "",
        fillRect: vi.fn(),
        drawImage: (source: unknown) => {
          drawn.push(source);
          lastSource = source;
        },
        getImageData: () => {
          if (options.taintedSources?.has(lastSource)) {
            throw new DOMException("The canvas has been tainted", "SecurityError");
          }
          return { width: SIZE, height: SIZE, data: HALF_WHITE };
        },
      }),
    }),
  } as unknown as Document;
  return { document, drawn };
}

function image(src: string, ownerDocument: Document): HTMLImageElement {
  return { currentSrc: src, src, ownerDocument } as unknown as HTMLImageElement;
}

describe("表示中の画像からハッシュを読む", () => {
  beforeEach(() => {
    fetchBinary.mockReset();
    isTauriRuntime.mockReturnValue(false);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ close: vi.fn() })),
    );
  });

  it("拡張機能では表示中の<img>から読み、取り直さない", async () => {
    const { document, drawn } = fakeDocument();
    const img = image("https://example.com/a.jpg", document);
    await expect(computeImageHashFromElement(img)).resolves.toBe("f0f0f0f0f0f0f0f0");
    expect(drawn).toEqual([img]);
    expect(fetchBinary).not.toHaveBeenCalled();
  });

  it("Tauriでは別オリジンの画像を取り直して読む", async () => {
    isTauriRuntime.mockReturnValue(true);
    fetchBinary.mockResolvedValue({ status: 200, headers: {}, body: new ArrayBuffer(4) });
    const { document, drawn } = fakeDocument();
    const img = image("https://example.com/a.jpg", document);
    await expect(computeImageHashFromElement(img)).resolves.toBe("f0f0f0f0f0f0f0f0");
    expect(fetchBinary).toHaveBeenCalledWith("https://example.com/a.jpg");
    expect(drawn).not.toContain(img);
  });

  it("Tauriでもblob URLへ切り替え済みの画像は、取り直さずに読む", async () => {
    isTauriRuntime.mockReturnValue(true);
    const { document, drawn } = fakeDocument();
    const img = image("blob:http://127.0.0.1/1234", document);
    await expect(computeImageHashFromElement(img)).resolves.toBe("f0f0f0f0f0f0f0f0");
    expect(drawn).toEqual([img]);
    expect(fetchBinary).not.toHaveBeenCalled();
  });

  it("想定外にcanvasが汚染されたら、取り直して読む", async () => {
    fetchBinary.mockResolvedValue({ status: 200, headers: {}, body: new ArrayBuffer(4) });
    const img = {} as HTMLImageElement;
    const { document } = fakeDocument({ taintedSources: new Set([img]) });
    Object.assign(img, {
      currentSrc: "https://example.com/a.jpg",
      src: "",
      ownerDocument: document,
    });
    await expect(computeImageHashFromElement(img)).resolves.toBe("f0f0f0f0f0f0f0f0");
    expect(fetchBinary).toHaveBeenCalledTimes(1);
  });

  it("取り直しがHTTPエラーなら失敗にする", async () => {
    isTauriRuntime.mockReturnValue(true);
    fetchBinary.mockResolvedValue({ status: 404, headers: {}, body: new ArrayBuffer(0) });
    const { document } = fakeDocument();
    await expect(
      computeImageHashFromElement(image("https://example.com/a.jpg", document)),
    ).rejects.toThrow("HTTP 404");
  });
});
