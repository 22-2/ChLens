import type { IRes } from "src/service-container/interfaces";
import { describe, expect, it } from "vite-plus/test";

import {
  buildMomentumGraphData,
  calculateIkioi,
  collectResTimestamps,
  parseResTimestamp,
} from "./thread-momentum";

function res(num: number, date: string): IRes {
  return { num, name: "", mail: "", date, message: "" };
}

describe("スレの勢い計算", () => {
  it("曜日やミリ秒を含む投稿日時を読み取る", () => {
    expect(parseResTimestamp(res(1, "2026/10/27(火) 09:30:15.12 ID:abc"))).toBe(
      new Date(2026, 9, 27, 9, 30, 15).valueOf(),
    );
    expect(parseResTimestamp(res(1, "あぼーん"))).toBeNull();
  });

  it("読み取れない日時を除いて昇順に並べる", () => {
    const timestamps = collectResTimestamps([
      res(1, "2026/10/27 10:00"),
      res(2, "不明"),
      res(3, "2026/10/27 09:00"),
    ]);
    expect(timestamps).toEqual([
      new Date(2026, 9, 27, 9, 0).valueOf(),
      new Date(2026, 9, 27, 10, 0).valueOf(),
    ]);
  });

  it("最初のレスから基準時刻までの1日あたりのレス数を返す", () => {
    const now = new Date(2026, 9, 28, 9, 0).valueOf();
    const responses = [res(1, "2026/10/27 09:00"), res(2, "2026/10/27 21:00")];
    expect(calculateIkioi(responses, now)).toBe(2);
    expect(calculateIkioi([], now)).toBeNull();
    expect(calculateIkioi([res(1, "不明")], now)).toBeNull();
  });

  it("投稿日時がなければグラフを作らない", () => {
    expect(buildMomentumGraphData([res(1, "不明")])).toBeNull();
    const now = new Date(2026, 9, 27, 12, 0).valueOf();
    const graph = buildMomentumGraphData([res(1, "2026/10/27 09:00")], now);
    expect(graph?.values).toHaveLength(30);
    expect(graph?.rangeLabel).toBe("開始から3時間");
  });
});
