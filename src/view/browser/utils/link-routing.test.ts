import {
  parseInternalBrowserPage,
  parseInternalBrowserPageStrict,
  resolveAbsoluteUrl,
  RESPECT_DEFAULT_EXTERNAL,
  shouldHandleUrlWithApp,
} from "src/view/browser/utils/link-routing";
import { setItestServerMapForTesting } from "src/view/browser/utils/itest-server-map";
import { beforeEach, describe, expect, it } from "vite-plus/test";

describe("link-routing", () => {
  beforeEach(() => {
    setItestServerMapForTesting([]);
  });

  it("対応ホストの板URLだけを threadList として扱う", () => {
    expect(parseInternalBrowserPage("https://egg.5ch.io/software/")).toEqual({
      type: "threadList",
      title: "https://egg.5ch.io/software/",
      boardUrl: "https://egg.5ch.io/software/",
      boardTitle: "https://egg.5ch.io/software/",
    });
  });

  it("外部ホストでも test/read.cgi スレッドURLは内部URL扱いする", () => {
    expect(parseInternalBrowserPage("https://example.com/test/read.cgi/software/1/")).toEqual({
      type: "thread",
      title: "https://example.com/test/read.cgi/software/1/",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    });
    // /<board>/ 形式も板として受け入れる（失敗してもOK）
    expect(parseInternalBrowserPage("https://example.com/software/")).toEqual({
      type: "threadList",
      title: "https://example.com/software/",
      boardUrl: "https://example.com/software/",
      boardTitle: "https://example.com/software/",
    });
  });

  it("itest の prefix 付き test/read.cgi URL を thread として正規化する", () => {
    expect(
      parseInternalBrowserPage("https://itest.5ch.io/krsw/test/read.cgi/AAAA/1000000007/"),
    ).toEqual({
      type: "thread",
      title: "https://itest.5ch.io/test/read.cgi/AAAA/1000000007/",
      threadUrl: "https://itest.5ch.io/test/read.cgi/AAAA/1000000007/",
    });
  });

  it("itest.bbspink.com のスレURLを対応表で実サーバーへ変換する", () => {
    setItestServerMapForTesting([["adultgoods", "mercury.bbspink.com"]]);
    expect(
      parseInternalBrowserPage("https://itest.bbspink.com/test/read.cgi/adultgoods/1000000008/"),
    ).toEqual({
      type: "thread",
      title: "https://mercury.bbspink.com/test/read.cgi/adultgoods/1000000008/",
      threadUrl: "https://mercury.bbspink.com/test/read.cgi/adultgoods/1000000008/",
    });
  });

  it("itest の板URLも対応表で実サーバーへ変換する", () => {
    setItestServerMapForTesting([["software", "egg.5ch.io"]]);
    expect(parseInternalBrowserPage("https://itest.5ch.io/subback/software")).toEqual({
      type: "threadList",
      title: "https://egg.5ch.io/software/",
      boardUrl: "https://egg.5ch.io/software/",
      boardTitle: "https://egg.5ch.io/software/",
    });
  });

  it("対応表に無い itest URL はホスト名を変換せず残す", () => {
    expect(
      parseInternalBrowserPage("https://itest.bbspink.com/test/read.cgi/adultgoods/1000000008/"),
    ).toEqual({
      type: "thread",
      title: "https://itest.bbspink.com/test/read.cgi/adultgoods/1000000008/",
      threadUrl: "https://itest.bbspink.com/test/read.cgi/adultgoods/1000000008/",
    });
  });

  it("任意ドメインの /<board>/ パスも threadList として扱う", () => {
    expect(parseInternalBrowserPage("https://example.com/software/")).toEqual({
      type: "threadList",
      title: "https://example.com/software/",
      boardUrl: "https://example.com/software/",
      boardTitle: "https://example.com/software/",
    });
  });

  it("imgur の単一画像ページURLは板URLとして解析される（画像ビューア優先はopenResolvedUrl側で担保）", () => {
    // link-routing 自体は /<id>/ を板として返す。
    // スレ内サムネクリックで画像ビューアが開くかどうかは ThreadPage.openResolvedUrl の
    // toViewerImageUrl チェックが担保するため、ここでは解析結果だけを確認する。
    expect(parseInternalBrowserPage("https://imgur.com/TestImage/")).toEqual({
      type: "threadList",
      title: "https://imgur.com/TestImage/",
      boardUrl: "https://imgur.com/TestImage/",
      boardTitle: "https://imgur.com/TestImage/",
    });
  });

  it("eddibb の簡略 thread URL も内部スレURLへ正規化する", () => {
    expect(parseInternalBrowserPage("https://bbs.eddibb.cc/liveedge/1000000005/")).toEqual({
      type: "thread",
      title: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000005/",
      threadUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000005/",
    });
  });

  it("eddibb の省略 thread URL は末尾スラッシュなしでも内部スレURLへ正規化する", () => {
    expect(parseInternalBrowserPage("https://bbs.eddibb.cc/liveedge/1000000006")).toEqual({
      type: "thread",
      title: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000006/",
      threadUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000006/",
    });
  });

  it("respect-default-external モードでも /<board>/ 形式は横取りする", () => {
    const absoluteUrl = resolveAbsoluteUrl("/software/", "https://example.com/thread/");
    // /<board>/ 形式は全ドメインで内部遷移対象になったため true
    expect(shouldHandleUrlWithApp(absoluteUrl, RESPECT_DEFAULT_EXTERNAL)).toBe(true);
  });
});

describe("link-routing strict", () => {
  it("互換ホストのスレ/板URLは strict でも解析する", () => {
    expect(parseInternalBrowserPageStrict("https://egg.5ch.io/test/read.cgi/software/1/")).toEqual({
      type: "thread",
      title: "https://egg.5ch.io/test/read.cgi/software/1/",
      threadUrl: "https://egg.5ch.io/test/read.cgi/software/1/",
    });
    expect(parseInternalBrowserPageStrict("https://egg.5ch.io/software/")).toEqual({
      type: "threadList",
      title: "https://egg.5ch.io/software/",
      boardUrl: "https://egg.5ch.io/software/",
      boardTitle: "https://egg.5ch.io/software/",
    });
  });

  it("非互換ホストの /<board>/ は strict だと null", () => {
    expect(parseInternalBrowserPageStrict("https://example.com/software/")).toBeNull();
    expect(parseInternalBrowserPageStrict("https://imgur.com/TestImage/")).toBeNull();
  });

  it("非互換ホストでも test/read.cgi スレッドURLは strict だと null", () => {
    expect(
      parseInternalBrowserPageStrict("https://example.com/test/read.cgi/software/1/"),
    ).toBeNull();
  });

  it("eddibb は strict でも正規化する", () => {
    expect(parseInternalBrowserPageStrict("https://bbs.eddibb.cc/liveedge/1000000006")).toEqual({
      type: "thread",
      title: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000006/",
      threadUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000006/",
    });
  });
});
