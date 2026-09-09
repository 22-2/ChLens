import { describe, expect, it } from "vite-plus/test";
import { commentsAvailableAt, createTimedDatComments } from "./timed-dat-replay";

const dat = [
  "名無し<><>2026/09/09(水) 23:12:12.885 ID:first<>開始<br>です<>架空の実況スレ",
  "実況民<><>2026/09/09(水) 23:12:17.288 ID:second<>5秒後<>",
  "実況民<><>2026/09/09(水) 23:12:24.100 ID:third<>12秒後<>",
].join("\n");

describe("dat時刻再生", () => {
  it("先頭レスを0秒として、指定時刻までのコメントだけを返す", () => {
    const comments = createTimedDatComments(dat);
    expect(comments.map((comment) => comment.elapsedMilliseconds)).toEqual([0, 4_403, 11_215]);
    expect(commentsAvailableAt(comments, 0)).toEqual([]);
    expect(commentsAvailableAt(comments, 10_000).map((comment) => comment.responseNumber)).toEqual([
      1, 2,
    ]);
    expect(comments[0]?.text).toBe("開始\nです");
  });
});
