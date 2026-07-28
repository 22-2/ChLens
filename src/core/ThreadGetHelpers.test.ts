import {
  applyCachedInfoToThread,
  buildConditionalRequestHeaders,
  buildThreadFetchPlan,
  isMissingFromSubject,
  resolveThreadFromResponse,
  shouldRejectThreadResult,
} from "src/core/ThreadGetHelpers";
import type { ParsedThread } from "src/core/ThreadParser.js";
import { describe, expect, it } from "vite-plus/test";

const createThread = (title = "t", count = 1): ParsedThread => ({
  title,
  expired: false,
  res: Array.from({ length: count }, (_, i) => ({
    name: `name${i}`,
    mail: `mail${i}`,
    message: `message${i}`,
    other: `other${i}`,
  })),
});

describe("ThreadGetHelpers", () => {
  it("shitaraba(non-archive)+cache builds delta range path", () => {
    const plan = buildThreadFetchPlan({
      tsld: "shitaraba.net",
      isArchive: false,
      isHtml: false,
      hasCache: true,
      basePath: "https://jbbs.shitaraba.net/bbs/rawmode.cgi/a/b/123/",
      cacheResLength: 10,
    });

    expect(plan.deltaFlg).toBe(true);
    expect(plan.readcgiVer).toBe(5);
    expect(plan.xhrPath).toBe("https://jbbs.shitaraba.net/bbs/rawmode.cgi/a/b/123/11-");
  });

  it("html thread + cache(read.cgi v6) builds +1-n range and query", () => {
    const plan = buildThreadFetchPlan({
      tsld: "5ch.net",
      isArchive: false,
      isHtml: true,
      hasCache: true,
      basePath: "https://example.com/test/read.cgi/a/123/",
      cacheResLength: 50,
      cacheReadcgiVer: 6,
    });

    expect(plan.deltaFlg).toBe(true);
    expect(plan.readcgiVer).toBe(6);
    expect(plan.xhrPath).toBe("https://example.com/test/read.cgi/a/123/51-n?v=pc");
  });

  it("html thread + cache(read.cgi v5) builds legacy -n range and query", () => {
    const plan = buildThreadFetchPlan({
      tsld: "5ch.net",
      isArchive: false,
      isHtml: true,
      hasCache: true,
      basePath: "https://example.com/test/read.cgi/a/123/",
      cacheResLength: 50,
      cacheReadcgiVer: 5,
    });

    expect(plan.deltaFlg).toBe(true);
    expect(plan.readcgiVer).toBe(5);
    expect(plan.xhrPath).toBe("https://example.com/test/read.cgi/a/123/50-n?v=pc");
  });

  it("buildConditionalRequestHeaders emits both validators when available", () => {
    const headers = buildConditionalRequestHeaders({
      hasCache: true,
      lastModified: 1714800000000,
      etag: '"abc"',
    });

    expect(headers["If-Modified-Since"]).toBe(new Date(1714800000000).toUTCString());
    expect(headers["If-None-Match"]).toBe('"abc"');
  });

  it("buildConditionalRequestHeaders returns empty when cache is absent", () => {
    const headers = buildConditionalRequestHeaders({
      hasCache: false,
      lastModified: 1714800000000,
      etag: '"abc"',
    });

    expect(headers).toEqual({});
  });

  it("resolveThreadFromResponse merges html delta response into cached thread", () => {
    const cacheThread = createThread("cached", 2);
    const parsedDelta = createThread("delta", 2);
    const parseThreadFn = () => parsedDelta;

    const result = resolveThreadFromResponse({
      response: {
        status: 200,
        body: "delta",
        headers: {},
        url: "https://example.com/",
      },
      readcgiVer: 6,
      deltaFlg: true,
      isHtml: true,
      bbsType: "2ch",
      hasCache: true,
      cacheData: "cached",
      cacheParsed: cacheThread,
      cacheResLength: 2,
      url: {},
      format2chnet: "html",
      parseThreadFn,
    });

    expect(result.parseFailed).toBe(false);
    expect(result.noChangeFlg).toBe(false);
    expect(result.thread?.res).toHaveLength(4);
  });

  it("resolveThreadFromResponse flags parseFailed when html delta parse fails", () => {
    const result = resolveThreadFromResponse({
      response: {
        status: 200,
        body: "delta",
        headers: {},
        url: "https://example.com/",
      },
      readcgiVer: 6,
      deltaFlg: true,
      isHtml: true,
      bbsType: "2ch",
      hasCache: true,
      cacheParsed: createThread("cached", 2),
      cacheResLength: 2,
      url: {},
      format2chnet: "html",
      parseThreadFn: () => null,
    });

    expect(result.parseFailed).toBe(true);
    expect(result.thread).toBeUndefined();
  });

  it("shouldRejectThreadResult rejects 2ch status 203 even when thread exists", () => {
    const rejected = shouldRejectThreadResult({
      thread: createThread(),
      response: {
        status: 203,
        body: "",
        headers: {},
        url: "https://example.com/",
      },
      bbsType: "2ch",
      readcgiVer: 5,
      hasCache: true,
    });

    expect(rejected).toBe(true);
  });

  it("applyCachedInfoToThread pads aboon rows to cached count", () => {
    const thread = createThread("x", 1);
    applyCachedInfoToThread({
      thread,
      status: "success",
      cachedResCount: 3,
    });

    expect(thread.res).toHaveLength(3);
    expect(thread.res[2]).toEqual({
      name: "あぼーん",
      mail: "あぼーん",
      message: "あぼーん",
      other: "あぼーん",
    });
  });

  it("applyCachedInfoToThread does not expire a live thread on a board-cache miss", () => {
    const thread = createThread();

    applyCachedInfoToThread({
      thread,
      status: "not_found",
    });

    expect(thread.expired).toBe(false);
  });

  it("reports a subject miss without treating it as an explicit expiration", () => {
    expect(isMissingFromSubject("not_found")).toBe(true);
    expect(isMissingFromSubject("success")).toBe(false);
    expect(isMissingFromSubject("none")).toBe(false);
  });
});
