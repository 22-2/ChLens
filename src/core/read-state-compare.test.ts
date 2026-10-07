// @vitest-environment node
import { isNewerReadState } from "src/core/read-state-compare";
import { describe, expect, it } from "vite-plus/test";

const base = { received: 10, read: 5, last: 5 };

describe("既読状態の新旧比較", () => {
  it("比較先がなければ新しいとは判定しない", () => {
    expect(isNewerReadState(base, null)).toBe(false);
    expect(isNewerReadState(undefined, undefined)).toBe(false);
  });

  it("比較元がなければ比較先を新しいと判定する", () => {
    expect(isNewerReadState(null, base)).toBe(true);
  });

  it("受信数、既読数の順に多い方を新しいと判定する", () => {
    expect(isNewerReadState(base, { ...base, received: 11 })).toBe(true);
    expect(isNewerReadState(base, { ...base, received: 9, read: 9 })).toBe(false);
    expect(isNewerReadState(base, { ...base, read: 6 })).toBe(true);
  });

  it("受信数と既読数が同じなら更新日時を優先し、片方だけ日時を持つ場合は日時を持つ方を新しいとする", () => {
    expect(isNewerReadState({ ...base, date: 1 }, { ...base, date: 2 })).toBe(true);
    expect(isNewerReadState({ ...base, date: 2 }, { ...base, date: 1 })).toBe(false);
    expect(isNewerReadState({ ...base, date: 1 }, base)).toBe(false);
    expect(isNewerReadState(base, { ...base, date: 1 })).toBe(true);
  });

  it("日時がなければ最終表示位置かオフセットの違いを更新とみなす", () => {
    expect(isNewerReadState(base, { ...base, last: 3 })).toBe(true);
    expect(isNewerReadState(base, { ...base, offset: 100 })).toBe(true);
    expect(isNewerReadState(base, { ...base })).toBe(false);
  });
});
