import {
  buildThreadFindIndex,
  findStartIndex,
  findThreadMatches,
  stepMatchIndex,
} from "src/features/thread/domain/thread-find";
import { stripHtml } from "src/view/browser/utils/response-format";
import { findSearchMatchRanges } from "src/view/browser/utils/search-highlight";
import { describe, expect, it } from "vite-plus/test";

const responses = [
  { num: 1, name: "名無し", id: "abc", message: "かたかなのテスト<br>カタカナ" },
  { num: 2, name: "ﾃｽﾄ住民", message: "関係ないレス" },
  { num: 3, name: "名無し", id: "ABC", message: '<a class="anchor">&gt;&gt;1</a> ＴＥＳＴ' },
];
const index = buildThreadFindIndex(responses);

describe("スレッド内のページ内検索", () => {
  it("名前・ID・本文の順に、かなカナ・全角半角・大小を区別せず一致を集める", () => {
    expect(findThreadMatches(index, "カタカナ")).toEqual([
      { resNum: 1, field: "body", occurrence: 0 },
      { resNum: 1, field: "body", occurrence: 1 },
    ]);
    expect(findThreadMatches(index, "てすと")).toEqual([
      { resNum: 1, field: "body", occurrence: 0 },
      { resNum: 2, field: "name", occurrence: 0 },
    ]);
    expect(findThreadMatches(index, "abc").map((match) => match.resNum)).toEqual([1, 3]);
    expect(findThreadMatches(index, "test")).toEqual([{ resNum: 3, field: "body", occurrence: 0 }]);
  });

  it("タグの中は探さず、文字参照は表示される文字として探す", () => {
    expect(findThreadMatches(index, "anchor")).toEqual([]);
    expect(findThreadMatches(index, ">>1")).toEqual([{ resNum: 3, field: "body", occurrence: 0 }]);
  });

  it("空の検索語では一致なしとする", () => {
    expect(findThreadMatches(index, "  ")).toEqual([]);
  });

  it("前後の一致へ移り、端では反対の端へ回る", () => {
    expect(stepMatchIndex(-1, 3, 1)).toBe(0);
    expect(stepMatchIndex(-1, 3, -1)).toBe(2);
    expect(stepMatchIndex(2, 3, 1)).toBe(0);
    expect(stepMatchIndex(0, 3, -1)).toBe(2);
    expect(stepMatchIndex(0, 0, 1)).toBe(-1);
  });

  it("見ているレス以降の最初の一致から始め、なければ先頭の一致にする", () => {
    const matches = findThreadMatches(index, "abc");
    expect(findStartIndex(matches, 2)).toBe(1);
    expect(findStartIndex(matches, 4)).toBe(0);
    expect(findStartIndex([], 1)).toBe(-1);
  });

  it("レスの中の一致の数は、強調表示が数える数と同じになる", () => {
    const message = "ｶﾞｯﾂ がっつ ガッツガッツ";
    const [match] = buildThreadFindIndex([{ num: 1, name: "", message }]);
    const count = findThreadMatches([match!], "ガッツ").length;
    expect(count).toBe(findSearchMatchRanges(stripHtml(message), "ガッツ").length);
    expect(count).toBe(4);
  });
});
