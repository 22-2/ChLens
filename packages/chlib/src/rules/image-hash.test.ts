// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import {
  hammingDistance64,
  isSimilarImageHash,
  maxImageHashDistance,
  normalizeImageHash,
} from "./image-hash";

describe("類似画像NGのハッシュ", () => {
  it("16進16桁だけを受け付け、小文字にそろえる", () => {
    expect(normalizeImageHash(" 0123456789ABCDEF ")).toBe("0123456789abcdef");
    expect(normalizeImageHash("0123456789abcde")).toBeNull();
    expect(normalizeImageHash("0123456789abcdef0")).toBeNull();
    expect(normalizeImageHash("0123456789abcdeg")).toBeNull();
  });

  it("上下32bitをまたいで違うビットを数える", () => {
    expect(hammingDistance64("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance64("0000000000000000", "ffffffffffffffff")).toBe(64);
    // 上位32bitの最上位と、下位32bitの最下位が1ビットずつ違う。
    expect(hammingDistance64("8000000000000001", "0000000000000000")).toBe(2);
    expect(hammingDistance64("0123456789abcdef", "fedcba9876543210")).toBe(64);
  });

  it("一致率を許容する違いのビット数へ変換する", () => {
    expect(maxImageHashDistance(85)).toBe(9);
    expect(maxImageHashDistance(100)).toBe(0);
    expect(maxImageHashDistance(50)).toBe(32);
    expect(maxImageHashDistance(90)).toBe(6);
  });

  it("既定の85%では違いが9ビットまで似ているとみなす", () => {
    const base = "0000000000000000";
    expect(isSimilarImageHash(base, "00000000000001ff")).toBe(true);
    expect(isSimilarImageHash(base, "00000000000003ff")).toBe(false);
    expect(isSimilarImageHash(base, "0000000000000001", 100)).toBe(false);
    expect(isSimilarImageHash(base, base, 100)).toBe(true);
  });
});
