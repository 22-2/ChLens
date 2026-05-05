import {
  isTargetContentScriptUrl,
  normalizeContentScriptTargetUrl,
} from "src/content-scripts/url-targets";
import { describe, expect, it } from "vitest";

describe("content script url targets", () => {
  it("5ch の read.cgi スレッドURLを対象と判定する", () => {
    expect(
      isTargetContentScriptUrl("https://egg.5ch.io/test/read.cgi/software/1000000010/"),
    ).toBe(true);
  });

  it("したらば storage 形式URLを対象と判定する", () => {
    expect(
      isTargetContentScriptUrl("https://jbbs.shitaraba.net/computer/12345/storage/1000000001.html"),
    ).toBe(true);
  });

  it("machi 板 index URLを対象と判定する", () => {
    expect(isTargetContentScriptUrl("https://kanto.machi.to/kana/index.html")).toBe(true);
  });

  it("非対応URLを除外する", () => {
    expect(isTargetContentScriptUrl("https://example.com/path/to/page")).toBe(false);
  });

  it("eddibb の素URLを read.cgi 形式へ正規化する", () => {
    expect(normalizeContentScriptTargetUrl("https://bbs.eddibb.cc/liveedge/1000000005/"))
      .toBe("http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000005/");
  });
});
