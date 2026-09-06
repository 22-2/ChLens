import { describe, expect, it } from "vite-plus/test";
import { buildIndexes } from "src/view/browser/utils/thread-index";
import type { IRes } from "src/service-container";

const createResponse = (num: number, message: string, ng?: IRes["ng"]): IRes => ({
  num,
  name: "名無しさん",
  mail: "",
  date: "",
  message,
  ng,
});

describe("スレッド索引", () => {
  it("hard-ngのレスを返信数と返信ツリーの索引から除外する", () => {
    const indexes = buildIndexes(
      [
        createResponse(1, "本文"),
        createResponse(2, "&gt;&gt;1", { type: "Body" }),
        createResponse(3, "&gt;&gt;1"),
      ],
      { excludeHardNgResponses: true },
    );

    expect(indexes.repIndex.get(1)).toEqual(new Set([3]));
    expect(indexes.ancIndex.has(2)).toBe(false);
    expect(indexes.ancIndex.get(3)).toEqual(new Set([1]));
  });

  it("通常の索引ではNGレスも返信情報へ含める", () => {
    const indexes = buildIndexes([
      createResponse(1, "本文"),
      createResponse(2, "&gt;&gt;1", { type: "Body" }),
    ]);

    expect(indexes.repIndex.get(1)).toEqual(new Set([2]));
  });
});
