import { createSizeCache } from "src/view/browser/utils/virtual-list/size-cache";
import { describe, expect, it } from "vite-plus/test";

describe("実測高さのキャッシュ", () => {
  it("描画条件が一致するときだけ実測値を返し、古い値は peek で読める", () => {
    const cache = createSizeCache();
    expect(cache.set(1, "w800", 120)).toBe(true);
    expect(cache.get(1, "w800")).toBe(120);
    expect(cache.get(1, "w600")).toBeUndefined();
    expect(cache.peek(1)).toEqual({ size: 120, signature: "w800" });
  });

  it("丸め誤差程度の変化は変更として扱わない", () => {
    const cache = createSizeCache();
    cache.set(1, "w800", 120);
    expect(cache.set(1, "w800", 120.3)).toBe(false);
    expect(cache.set(1, "w800", 121)).toBe(true);
    expect(cache.set(1, "w600", 121)).toBe(true);
  });

  it("指定したキー以外を捨てる", () => {
    const cache = createSizeCache();
    cache.set(1, "a", 10);
    cache.set(2, "a", 20);
    cache.set(3, "a", 30);
    cache.retain([1, 3]);
    expect(cache.size).toBe(2);
    expect(cache.peek(2)).toBeUndefined();
  });
});
