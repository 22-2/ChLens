import { isInTimeRange, parseDateRange } from "src/view/browser/utils/query-date";
import { describe, expect, it } from "vite-plus/test";

// 月は 0 始まり。2026/10/15 10:00 を「いま」にする。
const NOW = new Date(2026, 9, 15, 10, 0, 0).valueOf();
const at = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) =>
  new Date(year, month, day, hour, minute, second).valueOf();

function range(text: string, kind: "date" | "datetime" = "date") {
  return parseDateRange(text, kind, NOW);
}

describe("検索構文の日付の範囲", () => {
  it("書いた精度がそのまま範囲になる", () => {
    expect(range("2026")).toEqual({ start: at(2026, 0, 1), end: at(2027, 0, 1) });
    expect(range("2026/10")).toEqual({ start: at(2026, 9, 1), end: at(2026, 10, 1) });
    expect(range("2026/10/02")).toEqual({ start: at(2026, 9, 2), end: at(2026, 9, 3) });
    expect(range("2026/10/02 12:30", "datetime")).toEqual({
      start: at(2026, 9, 2, 12, 30),
      end: at(2026, 9, 2, 12, 31),
    });
    expect(range("2026/10/02 12:30:15", "datetime")).toEqual({
      start: at(2026, 9, 2, 12, 30, 15),
      end: at(2026, 9, 2, 12, 30, 16),
    });
  });

  it("区切りは / - . と日本語の表記を受ける", () => {
    const expected = { start: at(2026, 9, 2), end: at(2026, 9, 3) };
    expect(range("2026-10-02")).toEqual(expected);
    expect(range("2026.10.2")).toEqual(expected);
    expect(range("2026年10月2日")).toEqual(expected);
    expect(range("２０２６／１０／０２")).toEqual(expected);
  });

  it("年を省いた月日は今年として読む", () => {
    expect(range("10/02")).toEqual({ start: at(2026, 9, 2), end: at(2026, 9, 3) });
  });

  it("~ で始点から終点までの範囲にし、片側を省くと上限・下限なしにする", () => {
    expect(range("2026/10/01~2026/10/05")).toEqual({ start: at(2026, 9, 1), end: at(2026, 9, 6) });
    expect(range("2026/10/05~")).toEqual({ start: at(2026, 9, 5), end: null });
    expect(range("~2026/10/05")).toEqual({ start: null, end: at(2026, 9, 6) });
    expect(range("2026/10/01〜2026/10/02")).toEqual({
      start: at(2026, 9, 1),
      end: at(2026, 9, 3),
    });
  });

  it("today と yesterday（今日・昨日）を読む", () => {
    expect(range("today")).toEqual({ start: at(2026, 9, 15), end: at(2026, 9, 16) });
    expect(range("昨日")).toEqual({ start: at(2026, 9, 14), end: at(2026, 9, 15) });
  });

  it("時刻だけの指定は datetime: でのみ使え、今日のその時刻になる", () => {
    expect(range("12:00~13:00", "datetime")).toEqual({
      start: at(2026, 9, 15, 12, 0),
      end: at(2026, 9, 15, 13, 1),
    });
    expect(range("12:00", "date")).toBeNull();
  });

  it("読めない値は null にする", () => {
    for (const text of ["", "abc", "2026/13/01", "2026/02/30", "2026/10/02 25:00", "~", "1~2~3"]) {
      expect(range(text, "datetime")).toBeNull();
    }
  });

  it("範囲の終わりは含まない", () => {
    const day = range("2026/10/02")!;
    expect(isInTimeRange(at(2026, 9, 2, 23, 59, 59), day)).toBe(true);
    expect(isInTimeRange(at(2026, 9, 3), day)).toBe(false);
    expect(isInTimeRange(at(2026, 9, 1, 23, 59, 59), day)).toBe(false);
  });
});
