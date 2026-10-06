// @vitest-environment node
import type { IRes as CanonicalRes } from "packages/ch-lib/src/index";
import { describe, expect, it } from "vite-plus/test";

import { toViewRes } from "./to-view-res";

const post = (patch: Partial<CanonicalRes> = {}): CanonicalRes => ({
  number: 3,
  name: "名無しさん",
  mail: "sage",
  date: "2026/08/27(木) 12:00:00.00 ID:abc",
  message: "本文",
  other: "2026/08/27(木) 12:00:00.00 ID:abc",
  ...patch,
});

describe("toViewRes", () => {
  it("番号をnumへ写し、日付は表示用の日時だけに絞る", () => {
    const res = toViewRes(post({ id: "abc" }));

    expect(res.num).toBe(3);
    expect(res.date).toBe("2026/08/27(木) 12:00:00.00");
    expect(res.other).toBe("2026/08/27(木) 12:00:00.00 ID:abc");
  });

  it("アダプタで抽出済みのID・Slip・Trip・BEをそのまま写す", () => {
    const res = toViewRes(post({ id: "abc", slip: "sl ip", trip: "◆trip", be: "BE:1-A(1)" }));

    expect(res).toMatchObject({ id: "abc", slip: "sl ip", trip: "◆trip", be: "BE:1-A(1)" });
  });

  it("IDが未抽出でもotherから推測し直さない", () => {
    expect(toViewRes(post()).id).toBeUndefined();
  });

  it("otherが無ければdateを使い、日時が無ければ空文字にする", () => {
    expect(toViewRes(post({ other: undefined, date: "2026/08/27 12:00:00" })).date).toBe(
      "2026/08/27 12:00:00",
    );
    expect(toViewRes(post({ other: "Over 1000 Thread", date: "" })).date).toBe("");
  });

  it("入力のレスを変更しない", () => {
    const input = post({ id: "abc" });
    const snapshot = structuredClone(input);

    toViewRes(input);

    expect(input).toEqual(snapshot);
  });
});
