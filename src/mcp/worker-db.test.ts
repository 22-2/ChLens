import { matchesQuery, normalizeHistoryLimit, resolveDayRange } from "src/mcp/worker-db";
import { describe, expect, it } from "vite-plus/test";

describe("MCP向け履歴ヘルパー", () => {
  it("limitを1から100の範囲へ正規化する", () => {
    expect(normalizeHistoryLimit(undefined)).toBe(20);
    expect(normalizeHistoryLimit(Number.NaN)).toBe(20);
    expect(normalizeHistoryLimit(0)).toBe(1);
    expect(normalizeHistoryLimit(101)).toBe(100);
    expect(normalizeHistoryLimit(2.7)).toBe(2);
    expect(normalizeHistoryLimit(20)).toBe(20);
  });

  it("クエリの部分一致を大文字小文字を区別せず判定する", () => {
    // 変更理由: 呼び出し側でqueryを小文字化する契約のため、
    // haystack側の大文字小文字だけを吸収できればよい。
    expect(matchesQuery("Testスレ\n本文", "test")).toBe(true);
    expect(matchesQuery("テストスレ\n本文", "テスト")).toBe(true);
    expect(matchesQuery("テストスレ\n本文", "存在しない")).toBe(false);
  });

  it("日付指定を現地時間の半開区間へ変換する", () => {
    // 変更理由: 期待値も現地時間で組み立てるため、タイムゾーンに依存せず検証できる。
    expect(resolveDayRange(undefined)).toBeNull();
    expect(resolveDayRange("")).toBeNull();
    expect(resolveDayRange("2026-09-26")).toEqual({
      start: new Date(2026, 8, 26, 0, 0, 0, 0).getTime(),
      end: new Date(2026, 8, 27, 0, 0, 0, 0).getTime(),
    });
  });

  it("不正な日付指定を拒否する", () => {
    expect(() => resolveDayRange("2026/09/26")).toThrow();
    expect(() => resolveDayRange("2026-02-30")).toThrow();
    expect(() => resolveDayRange("昨日")).toThrow();
  });
});
