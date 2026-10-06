// @vitest-environment node
import type { IRes } from "src/service-container";
import {
  buildReplyTreeCopyText,
  collectReplyTreeEntries,
  collectReplyTreeResponses,
  resolveReplyTreeAncestorPath,
} from "src/view/browser/utils/reply-tree-collect";
import { describe, expect, it } from "vite-plus/test";

function createRes(num: number, message = `message-${num}`): IRes {
  return {
    num,
    name: `name-${num}`,
    mail: "",
    date: "2026/04/19(日) 12:00:00.000",
    message,
  };
}

function createResMap(nums: number[]): Map<number, IRes> {
  return new Map(nums.map((num) => [num, createRes(num)]));
}

describe("collectReplyTreeEntries", () => {
  it("返信番号の昇順に深さ優先で辿り、深さを付けて平坦化する", () => {
    const repIndex = new Map<number, Set<number>>([
      [1, new Set([5, 2])],
      [2, new Set([4, 3])],
    ]);
    const entries = collectReplyTreeEntries(1, repIndex, createResMap([1, 2, 3, 4, 5]));

    expect(entries.map(({ res, depth }) => [res.num, depth])).toEqual([
      [2, 0],
      [3, 1],
      [4, 1],
      [5, 0],
    ]);
  });

  it("循環参照や重複アンカーがあっても同じレスを二度出さない", () => {
    const repIndex = new Map<number, Set<number>>([
      [1, new Set([2, 3])],
      [2, new Set([1, 3])],
      [3, new Set([2])],
    ]);
    const entries = collectReplyTreeEntries(1, repIndex, createResMap([1, 2, 3]));

    expect(entries.map(({ res, depth }) => [res.num, depth])).toEqual([
      [2, 0],
      [3, 1],
    ]);
  });

  it("resMap に存在しないレスは辿らない", () => {
    const repIndex = new Map<number, Set<number>>([
      [1, new Set([2])],
      [2, new Set([3])],
    ]);
    const entries = collectReplyTreeEntries(1, repIndex, createResMap([1, 3]));

    expect(entries).toEqual([]);
  });
});

describe("collectReplyTreeResponses", () => {
  it("平坦化した返信ツリーのレスだけを同じ順序で返す", () => {
    const repIndex = new Map<number, Set<number>>([
      [1, new Set([2, 4])],
      [2, new Set([3])],
    ]);
    const responses = collectReplyTreeResponses(1, repIndex, createResMap([1, 2, 3, 4]));

    expect(responses.map((res) => res.num)).toEqual([2, 3, 4]);
  });
});

describe("resolveReplyTreeAncestorPath", () => {
  it("枝の先頭を起点にし、残りの祖先と選択レスを上から下へ並べる", () => {
    const resMap = createResMap([1, 2, 3, 4]);
    const path = resolveReplyTreeAncestorPath(resMap.get(4)!, [1, 2, 3], resMap);

    expect(path.sourceRes.num).toBe(1);
    expect(path.replyResponses.map((res) => res.num)).toEqual([2, 3, 4]);
  });

  it("解決できる祖先がなければ選択レス単体を起点にする", () => {
    const resMap = createResMap([4]);
    const path = resolveReplyTreeAncestorPath(resMap.get(4)!, [1, 2], resMap);

    expect(path.sourceRes.num).toBe(4);
    expect(path.replyResponses).toEqual([]);
  });
});

describe("buildReplyTreeCopyText", () => {
  it("返信がなければ見出しを付けず、スレタイとURLだけを末尾に付ける", () => {
    const text = buildReplyTreeCopyText(
      createRes(1, "source"),
      [],
      "テストスレタイ",
      "https://example.com/test/read.cgi/board/123/",
    );

    expect(text).not.toContain("[返信レス]");
    expect(text.endsWith("\n\nテストスレタイ\nhttps://example.com/test/read.cgi/board/123/")).toBe(
      true,
    );
  });

  it("返信があれば見出しの後にレスを空行区切りで並べる", () => {
    const text = buildReplyTreeCopyText(createRes(1, "source"), [
      createRes(2, "first"),
      createRes(3, "second"),
    ]);

    const [sourcePart, replyPart] = text.split("\n\n[返信レス]\n");
    expect(sourcePart).toContain("source");
    expect(replyPart.split("\n\n")).toHaveLength(2);
    expect(replyPart).toContain("first");
    expect(replyPart).toContain("second");
  });
});
