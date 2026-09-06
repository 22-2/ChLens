import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_NG_DISPLAY_MODE,
  NG_DISPLAY_MODE_OPTIONS,
  normalizeNgDisplayMode,
} from "./ng-display-mode";

describe("NGレス表示方式", () => {
  it("旧設定のoffとonをhard-ngとsoft-ngへ読み替える", () => {
    expect(normalizeNgDisplayMode("off")).toBe("hard-ng");
    expect(normalizeNgDisplayMode("on")).toBe("soft-ng");
  });

  it("新しい3方式をそのまま受け付ける", () => {
    expect(NG_DISPLAY_MODE_OPTIONS.map((option) => option.const)).toEqual([
      "hard-ng",
      "soft-ng",
      "highlight-ng",
    ]);
    expect(normalizeNgDisplayMode("hard-ng")).toBe("hard-ng");
    expect(normalizeNgDisplayMode("soft-ng")).toBe("soft-ng");
    expect(normalizeNgDisplayMode("highlight-ng")).toBe("highlight-ng");
  });

  it("未知値や未設定値は安全側の既定方式へ戻す", () => {
    expect(normalizeNgDisplayMode(undefined)).toBe(DEFAULT_NG_DISPLAY_MODE);
    expect(normalizeNgDisplayMode(null)).toBe(DEFAULT_NG_DISPLAY_MODE);
    expect(normalizeNgDisplayMode("unexpected")).toBe(DEFAULT_NG_DISPLAY_MODE);
  });
});
