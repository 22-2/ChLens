// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";

import type { ResolveThreadFromResponseInput } from "./ThreadResponseResolver";
import { resolveThreadFromResponse, shouldRejectThreadResult } from "./ThreadResponseResolver";

type TestThread = { title: string; res: number[] };

function setup() {
  const cached: TestThread = { title: "保存済み", res: [1, 2] };
  const delta: TestThread = { title: "更新後", res: [3, 4] };
  const url = { key: "thread" };
  const parseThreadFn = vi.fn(
    (_url: typeof url, _body: string, _options: unknown): TestThread | null => delta,
  );
  const input: ResolveThreadFromResponseInput<typeof url, TestThread> = {
    response: { status: 200, body: "差分" },
    readcgiVer: 6,
    deltaFlg: true,
    isHtml: true,
    bbsType: "2ch",
    hasCache: true,
    cacheData: "保存済みの本文",
    cacheParsed: cached,
    cacheResLength: 2,
    url,
    format2chnet: "html",
    parseThreadFn,
  };
  return { input, cached, delta, parseThreadFn, url };
}

describe("スレッド取得応答の復元", () => {
  it("現行HTMLの差分はキャッシュの後に全レスを順序どおり追加する", () => {
    const { input, cached, delta, parseThreadFn, url } = setup();
    expect(resolveThreadFromResponse(input)).toEqual({
      thread: { title: "更新後", res: [1, 2, 3, 4] },
      noChangeFlg: false,
      parseFailed: false,
    });
    expect(parseThreadFn).toHaveBeenCalledWith(url, "差分", { format2chnet: "html", resLength: 2 });
    expect(cached.res).toEqual([1, 2]);
    expect(delta.res).toEqual([3, 4]);
  });

  it("旧HTMLの差分は先頭の重複レスだけを除いて追加する", () => {
    const { input, parseThreadFn } = setup();
    parseThreadFn.mockReturnValue({ title: "更新後", res: [2, 3, 4] });
    expect(resolveThreadFromResponse({ ...input, readcgiVer: 5 })).toEqual({
      thread: { title: "更新後", res: [1, 2, 3, 4] },
      noChangeFlg: false,
      parseFailed: false,
    });
  });

  it("旧HTMLの差分が既存の最終レスだけなら更新なしとしてキャッシュを返す", () => {
    const { input, cached, parseThreadFn } = setup();
    parseThreadFn.mockReturnValue({ title: "更新後", res: [2] });
    expect(resolveThreadFromResponse({ ...input, readcgiVer: 5 })).toEqual({
      thread: cached,
      noChangeFlg: true,
      parseFailed: false,
    });
  });

  it("現行HTMLの差分取得が500なら解析せずキャッシュを更新なしとして返す", () => {
    const { input, cached, parseThreadFn } = setup();
    expect(resolveThreadFromResponse({ ...input, response: { status: 500, body: "" } })).toEqual({
      thread: cached,
      noChangeFlg: true,
      parseFailed: false,
    });
    expect(parseThreadFn).not.toHaveBeenCalled();
  });

  it("HTML差分の解析済みキャッシュがなければ失敗を返す", () => {
    const { input, parseThreadFn } = setup();
    expect(resolveThreadFromResponse({ ...input, cacheParsed: null })).toEqual({
      thread: undefined,
      noChangeFlg: false,
      parseFailed: true,
    });
    expect(parseThreadFn).not.toHaveBeenCalled();
  });

  it("dat差分は保存済み本文に連結してから解析する", () => {
    const { input, delta, parseThreadFn, url } = setup();
    expect(resolveThreadFromResponse({ ...input, isHtml: false }).thread).toBe(delta);
    expect(parseThreadFn).toHaveBeenCalledWith(url, "保存済みの本文差分", { format2chnet: "html" });
  });

  it("全量応答はキャッシュを混ぜず応答本文だけを解析する", () => {
    const { input, delta, parseThreadFn, url } = setup();
    expect(resolveThreadFromResponse({ ...input, deltaFlg: false }).thread).toBe(delta);
    expect(parseThreadFn).toHaveBeenCalledWith(url, "差分", { format2chnet: "html" });
  });

  it("304ならHTMLは解析済みキャッシュ、datは保存済み本文から復元する", () => {
    const { input, cached, delta, parseThreadFn, url } = setup();
    const response = { status: 304, body: "無視する本文" };
    expect(resolveThreadFromResponse({ ...input, response })).toEqual({
      thread: cached,
      noChangeFlg: false,
      parseFailed: false,
    });
    expect(parseThreadFn).not.toHaveBeenCalled();
    expect(resolveThreadFromResponse({ ...input, response, isHtml: false }).thread).toBe(delta);
    expect(parseThreadFn).toHaveBeenCalledWith(url, "保存済みの本文", { format2chnet: "html" });
  });

  it("キャッシュがない304ではスレッドを復元しない", () => {
    const { input, parseThreadFn } = setup();
    expect(
      resolveThreadFromResponse({ ...input, response: { status: 304, body: "" }, hasCache: false }),
    ).toEqual({
      thread: undefined,
      noChangeFlg: false,
      parseFailed: false,
    });
    expect(parseThreadFn).not.toHaveBeenCalled();
  });

  it("2chの203応答はキャッシュがあれば保存済み、なければ応答本文から復元する", () => {
    const { input, cached, delta, parseThreadFn, url } = setup();
    const response = { status: 203, body: "応答本文" };
    expect(resolveThreadFromResponse({ ...input, response })).toEqual({
      thread: cached,
      noChangeFlg: false,
      parseFailed: false,
    });
    expect(parseThreadFn).not.toHaveBeenCalled();
    expect(resolveThreadFromResponse({ ...input, response, hasCache: false }).thread).toBe(delta);
    expect(parseThreadFn).toHaveBeenCalledWith(url, "応答本文", { format2chnet: "html" });
    expect(
      shouldRejectThreadResult({
        thread: cached,
        response,
        bbsType: "2ch",
        readcgiVer: 6,
        hasCache: true,
      }),
    ).toBe(true);
  });

  it("2chのdat差分が203なら応答ではなく保存済み本文を解析する", () => {
    const { input, delta, parseThreadFn, url } = setup();
    expect(
      resolveThreadFromResponse({
        ...input,
        response: { status: 203, body: "応答本文" },
        isHtml: false,
      }).thread,
    ).toBe(delta);
    expect(parseThreadFn).toHaveBeenCalledWith(url, "保存済みの本文", { format2chnet: "html" });
  });

  it("取得結果の採否は応答状態とキャッシュの有無で決まる", () => {
    const thread = { res: [1, 2] };
    const base = { thread, bbsType: "2ch", readcgiVer: 6, hasCache: true };
    expect(shouldRejectThreadResult({ ...base, response: { status: 200, body: "" } })).toBe(false);
    expect(shouldRejectThreadResult({ ...base, response: { status: 304, body: "" } })).toBe(false);
    expect(shouldRejectThreadResult({ ...base, response: { status: 500, body: "" } })).toBe(false);
    expect(
      shouldRejectThreadResult({ ...base, readcgiVer: 5, response: { status: 500, body: "" } }),
    ).toBe(true);
    expect(shouldRejectThreadResult({ ...base, response: { status: 404, body: "" } })).toBe(true);
    expect(shouldRejectThreadResult({ ...base, response: undefined })).toBe(false);
    expect(shouldRejectThreadResult({ ...base, response: undefined, hasCache: false })).toBe(true);
    expect(
      shouldRejectThreadResult({ ...base, thread: undefined, response: { status: 200, body: "" } }),
    ).toBe(true);
  });
});
