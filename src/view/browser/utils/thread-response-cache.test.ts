import type { IRes } from "src/service-container/interfaces";
import { describe, expect, it } from "vite-plus/test";

import { stripTrailingSyntheticAbobunResponses } from "./thread-response-cache";

const response = (num: number, message: string, other = ""): IRes => ({
  num,
  name: "名無し",
  mail: "",
  date: other === "" ? "2026/09/12(土) 12:00:00" : other,
  message,
  other,
});

const abobun = (num: number): IRes => ({
  num,
  name: "あぼーん",
  mail: "あぼーん",
  date: "",
  message: "あぼーん",
  other: "あぼーん",
});

describe("スレッドレスキャッシュのあぼーん補填除去", () => {
  it("末尾の表示用補填だけを除去する", () => {
    const responses = [response(1, "本文"), abobun(2), abobun(3)];

    expect(stripTrailingSyntheticAbobunResponses(responses)).toEqual([responses[0]]);
  });

  it("本文中の欠番補完は保持する", () => {
    const responses = [abobun(2), response(3, "本文")];

    expect(stripTrailingSyntheticAbobunResponses(responses)).toEqual(responses);
  });

  it("通常の末尾レスは変更しない", () => {
    const responses = [response(1, "本文"), response(2, "あぼーん", "日時")];

    expect(stripTrailingSyntheticAbobunResponses(responses)).toEqual(responses);
  });
});
