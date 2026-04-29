import {
  parseInternalBrowserPage,
  resolveAbsoluteUrl,
  RESPECT_DEFAULT_EXTERNAL,
  shouldHandleUrlWithApp,
} from "src/view/browser/utils/link-routing";
import { describe, expect, it } from "vitest";

describe("link-routing", () => {
  it("対応ホストの板URLだけを threadList として扱う", () => {
    expect(parseInternalBrowserPage("https://egg.5ch.io/software/")).toEqual({
      type: "threadList",
      title: "https://egg.5ch.io/software/",
      boardUrl: "https://egg.5ch.io/software/",
      boardTitle: "https://egg.5ch.io/software/",
    });
  });

  it("外部ホストが 5ch 風の path を持っていても内部URL扱いしない", () => {
    expect(
      parseInternalBrowserPage("https://example.com/test/read.cgi/software/1/"),
    ).toBeNull();
    expect(
      parseInternalBrowserPage("https://example.com/software/"),
    ).toBeNull();
  });

  it("eddibb の簡略 thread URL も内部スレURLへ正規化する", () => {
    expect(
      parseInternalBrowserPage("https://bbs.eddibb.cc/liveedge/1000000005/"),
    ).toEqual({
      type: "thread",
      title: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000005/",
      threadUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000005/",
    });
  });

  it("非対応ホストは respect-default-external 時にアプリ側で横取りしない", () => {
    const absoluteUrl = resolveAbsoluteUrl(
      "/software/",
      "https://example.com/thread/",
    );
    expect(shouldHandleUrlWithApp(absoluteUrl, RESPECT_DEFAULT_EXTERNAL)).toBe(
      false,
    );
  });
});
