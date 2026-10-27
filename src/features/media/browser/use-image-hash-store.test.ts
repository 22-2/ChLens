// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { computeImageHashFromElement, loggerError } = vi.hoisted(() => ({
  computeImageHashFromElement: vi.fn<(image: HTMLImageElement) => Promise<string>>(),
  loggerError: vi.fn(),
}));

vi.mock("./image-hash-reader", () => ({ computeImageHashFromElement }));
vi.mock("src/app/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: loggerError }),
}));

import { isImageHashPending, useImageHashStore } from "./use-image-hash-store";

function loadedImage(src = "https://example.com/a.jpg"): HTMLImageElement {
  return { complete: true, naturalWidth: 100, currentSrc: src, src } as HTMLImageElement;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const KEY = "https://example.com/a.jpg";

describe("類似画像NGのハッシュの保持", () => {
  beforeEach(() => {
    computeImageHashFromElement.mockReset();
    loggerError.mockReset();
    useImageHashStore.setState({ hashingEnabled: false, entries: new Map() });
  });

  it("類似画像NGのルールがないときは計算しない", () => {
    useImageHashStore.getState().requestHash(KEY, loadedImage());
    expect(computeImageHashFromElement).not.toHaveBeenCalled();
    expect(useImageHashStore.getState().entries.size).toBe(0);
  });

  it("計算中は判定待ちにし、終わったらハッシュを持つ", async () => {
    computeImageHashFromElement.mockResolvedValue("0123456789abcdef");
    useImageHashStore.getState().setHashingEnabled(true);
    useImageHashStore.getState().requestHash(KEY, loadedImage());
    expect(useImageHashStore.getState().entries.get(KEY)).toEqual({ status: "pending" });
    await flush();
    expect(useImageHashStore.getState().entries.get(KEY)).toEqual({
      status: "ready",
      hash: "0123456789abcdef",
    });
  });

  it("計算中・計算済みの画像は計算し直さない", async () => {
    computeImageHashFromElement.mockResolvedValue("0123456789abcdef");
    const store = useImageHashStore.getState();
    store.setHashingEnabled(true);
    store.requestHash(KEY, loadedImage());
    store.requestHash(KEY, loadedImage());
    await flush();
    store.requestHash(KEY, loadedImage());
    expect(computeImageHashFromElement).toHaveBeenCalledTimes(1);
  });

  it("読み込みが終わっていない画像は依頼を受けない", () => {
    useImageHashStore.getState().setHashingEnabled(true);
    useImageHashStore
      .getState()
      .requestHash(KEY, { complete: false, naturalWidth: 0, src: KEY } as HTMLImageElement);
    expect(computeImageHashFromElement).not.toHaveBeenCalled();
  });

  it("失敗したらログを出して失敗として持ち、次の依頼でもう一度試す", async () => {
    const error = new Error("取得失敗");
    computeImageHashFromElement.mockRejectedValueOnce(error).mockResolvedValue("fedcba9876543210");
    const store = useImageHashStore.getState();
    store.setHashingEnabled(true);
    store.requestHash(KEY, loadedImage());
    await flush();
    expect(useImageHashStore.getState().entries.get(KEY)).toEqual({ status: "error" });
    expect(loggerError).toHaveBeenCalledWith(
      "類似画像NGのハッシュを計算できませんでした",
      expect.objectContaining({ url: KEY, error }),
    );
    store.requestHash(KEY, loadedImage());
    await flush();
    expect(useImageHashStore.getState().entries.get(KEY)).toEqual({
      status: "ready",
      hash: "fedcba9876543210",
    });
  });

  it("表示できなかった画像は判定待ちを終える。計算済みのハッシュは上書きしない", async () => {
    const store = useImageHashStore.getState();
    store.markImageUnavailable(KEY);
    expect(useImageHashStore.getState().entries.has(KEY)).toBe(false);

    store.setHashingEnabled(true);
    store.markImageUnavailable(KEY);
    expect(useImageHashStore.getState().entries.get(KEY)).toEqual({ status: "error" });

    computeImageHashFromElement.mockResolvedValue("0123456789abcdef");
    store.requestHash("https://example.com/b.jpg", loadedImage());
    await flush();
    store.markImageUnavailable("https://example.com/b.jpg");
    expect(useImageHashStore.getState().entries.get("https://example.com/b.jpg")).toEqual({
      status: "ready",
      hash: "0123456789abcdef",
    });
  });

  it("上限を超えたら古いものから捨てる", async () => {
    computeImageHashFromElement.mockResolvedValue("0123456789abcdef");
    const store = useImageHashStore.getState();
    store.setHashingEnabled(true);
    for (let i = 0; i <= 2000; i++)
      store.requestHash(`https://example.com/${i}.jpg`, loadedImage());
    await flush();
    const { entries } = useImageHashStore.getState();
    expect(entries.size).toBe(2000);
    expect(entries.has("https://example.com/0.jpg")).toBe(false);
    expect(entries.has("https://example.com/2000.jpg")).toBe(true);
  });
});

describe("判定待ちかどうか", () => {
  it("ルールがあり、まだハッシュが出ていない画像だけ判定待ちにする", () => {
    expect(isImageHashPending(false, undefined)).toBe(false);
    expect(isImageHashPending(true, undefined)).toBe(true);
    expect(isImageHashPending(true, { status: "pending" })).toBe(true);
    expect(isImageHashPending(true, { status: "ready", hash: "0123456789abcdef" })).toBe(false);
    expect(isImageHashPending(true, { status: "error" })).toBe(false);
  });
});
