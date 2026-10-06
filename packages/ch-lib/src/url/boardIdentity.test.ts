import { describe, expect, it } from "vite-plus/test";

import { getBoardUrlKey, normalizeBoardUrl } from "./boardIdentity";

describe("normalizeBoardUrl", () => {
  it("スレッドURLを板URLへ変換して末尾形式を揃える", () => {
    expect(normalizeBoardUrl("https://bbs.eddibb.cc/test/read.cgi/liveedge/1000000001/")).toBe(
      "http://bbs.eddibb.cc/liveedge/",
    );
  });

  it("EddibBの旧形式と通常形式を同じ板キーへ変換する", () => {
    expect(getBoardUrlKey("https://bbs.eddibb.cc/liveedge/")).toBe(
      getBoardUrlKey("http://bbs.eddibb.cc/test/read.cgi/liveedge/"),
    );
  });

  it("既知の掲示板ホストだけに限定できる", () => {
    expect(normalizeBoardUrl("https://twitter.com/home/", { requireCompatibleHost: true })).toBe(
      null,
    );
    expect(normalizeBoardUrl("https://foo.5ch.io/software/", { requireCompatibleHost: true })).toBe(
      "https://foo.5ch.io/software/",
    );
  });

  it("既読情報用のワイルドカードホストを板URLとして受け入れない", () => {
    expect(normalizeBoardUrl("https://%2A.5ch.io/alone/", { requireCompatibleHost: true })).toBe(
      null,
    );
  });
});
