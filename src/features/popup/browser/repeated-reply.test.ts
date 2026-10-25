import type { IRes } from "src/service-container";
import { describe, expect, it } from "vite-plus/test";

import { findRepeatedReplyNums } from "./repeated-reply";

const res = (num: number, message: string, id?: string): IRes => ({
  num,
  message,
  id,
  name: "名無し",
  mail: "",
  date: "2026/10/25",
});

describe("ポップアップ内の同一IDによる複数返信", () => {
  it("同じ宛先へ2件以上返信したレスだけを強調対象にする", () => {
    expect(
      findRepeatedReplyNums([
        res(2, ">>1", "A"),
        res(3, ">>1", "A"),
        res(4, ">>5", "A"),
        res(6, ">>1", "B"),
      ]),
    ).toEqual(new Set([2, 3]));
  });
  it("重複アンカーと重複レスを二重に数えない", () => {
    const source = res(2, ">>1 >>1 &gt;&gt;1", "A");
    expect(findRepeatedReplyNums([source, source])).toEqual(new Set());
  });
  it("範囲・分岐・全角アンカーも既存の索引と同じ条件で集計する", () => {
    expect(
      findRepeatedReplyNums([
        res(4, ">>1-3", "A"),
        res(5, "＞＞２、８", "A"),
        res(6, ">>1-30", "A"),
      ]),
    ).toEqual(new Set([4, 5]));
  });
  it("IDなし・空ID・表記の異なるIDを同一視しない", () => {
    expect(
      findRepeatedReplyNums([
        res(2, ">>1"),
        res(3, ">>1"),
        res(4, ">>1", " "),
        res(5, ">>1", ""),
        res(6, ">>1", "A"),
        res(7, ">>1", "a"),
      ]),
    ).toEqual(new Set());
  });
  it("別ポップアップのレスは合算しない", () => {
    expect(findRepeatedReplyNums([res(2, ">>1", "A")])).toEqual(new Set());
    expect(findRepeatedReplyNums([res(3, ">>1", "A")])).toEqual(new Set());
  });
});
