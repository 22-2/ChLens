import { describe, expect, it, vi } from "vite-plus/test";

import {
  createItestServerMap,
  getBoardNetwork,
  getThreadReferenceKeys,
  replaceBoardUrlServer,
  resolveBoardMoveUrl,
  resolveBoardRedirectUrl,
} from "./serverMap";

const testHostnames = vi.hoisted(() => ({
  oldTwoChannel: "legacy2ch.example",
  oldFiveChannel: "legacy5ch.example",
  fiveChannel: "5ch.example",
  pink: "pink.example",
  sc: "sc.example",
  open: "open.example",
  machi: "machi.example",
  itestFiveChannel: "itest.5ch.example",
  itestPink: "itest.pink.example",
  jbbs: "jbbs.example.test",
  eddibb: "edge.example.test",
}));

vi.mock("./hosts", async (importOriginal) => {
  const hosts = await importOriginal<typeof import("./hosts")>();
  const HOSTNAME = {
    ...hosts.HOSTNAME,
    OLD_2CH: testHostnames.oldTwoChannel,
    OLD_5CH_NET: testHostnames.oldFiveChannel,
    NEW_5CH: testHostnames.fiveChannel,
    BBSPINK: testHostnames.pink,
    CH_2_SC: testHostnames.sc,
    OPEN2CH: testHostnames.open,
    MACHI: testHostnames.machi,
    ITEST_5CH: testHostnames.itestFiveChannel,
    ITEST_BBSPINK: testHostnames.itestPink,
    NEW_JBBS: testHostnames.jbbs,
    EDDIBB: testHostnames.eddibb,
  };
  const isCompatibleBoardHost = (hostname: string) =>
    [
      HOSTNAME.NEW_5CH,
      HOSTNAME.OLD_5CH_NET,
      HOSTNAME.OLD_2CH,
      HOSTNAME.CH_2_SC,
      HOSTNAME.BBSPINK,
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  return {
    ...hosts,
    HOSTNAME,
    normalizeBbsHostname: (hostname: string) => hostname,
    isCompatibleBoardHost,
    isArchiveOnlyBoardHost: (hostname: string) => hostname === `archive.${HOSTNAME.NEW_5CH}`,
    classifyBoardHost: (hostname: string) =>
      hostname === HOSTNAME.EDDIBB
        ? "eddibb"
        : hostname === HOSTNAME.NEW_JBBS
          ? "shitaraba"
          : hostname.endsWith(`.${HOSTNAME.MACHI}`)
            ? "machi"
            : isCompatibleBoardHost(hostname)
              ? "ch-style"
              : null,
  };
});

describe("掲示板サーバーURLの意味API", () => {
  it("bbsmenuの板URLからitest用のサーバー対応表を作る", () => {
    const map = createItestServerMap([
      `https://sample-server.${testHostnames.fiveChannel}/sample-board/`,
      `https://pink-server.${testHostnames.pink}/pink-board/`,
    ]);

    expect(map.get("sample-board")).toBe(`sample-server.${testHostnames.fiveChannel}`);
    expect(map.get("pink-board")).toBe(`pink-server.${testHostnames.pink}`);
    expect(getBoardNetwork(`https://${testHostnames.itestFiveChannel}/sample-board/123/`)).toBe(
      "5ch",
    );
    expect(getBoardNetwork(`https://${testHostnames.itestPink}/pink-board/123/`)).toBe("bbspink");
  });

  it("移転先HTMLとsubject応答から同じ板の5ch URLだけを採用する", () => {
    expect(
      resolveBoardMoveUrl(
        `https://old-server.${testHostnames.oldFiveChannel}/sample-board/`,
        `https://new-server.${testHostnames.fiveChannel}/sample-board/`,
      ),
    ).toBe(`https://new-server.${testHostnames.fiveChannel}/sample-board/`);
    expect(
      resolveBoardMoveUrl(
        `https://old-server.${testHostnames.fiveChannel}/sample-board/`,
        "https://redirect.example.test/untrusted/",
        `https://new-server.${testHostnames.fiveChannel}/sample-board/subject.txt`,
      ),
    ).toBe(`https://new-server.${testHostnames.fiveChannel}/sample-board/`);
    expect(
      resolveBoardRedirectUrl(
        `https://old-server.${testHostnames.fiveChannel}/sample-board/`,
        `https://new-server.${testHostnames.fiveChannel}/sample-board/subject.txt`,
      ),
    ).toBe(`https://new-server.${testHostnames.fiveChannel}/sample-board/`);
  });

  it("任意hostや別の板名を移転先として受け入れない", () => {
    expect(
      resolveBoardMoveUrl(
        `https://old-server.${testHostnames.fiveChannel}/sample-board/`,
        "https://external.example.test/sample-board/",
      ),
    ).toBeNull();
    expect(
      resolveBoardMoveUrl(
        `https://old-server.${testHostnames.fiveChannel}/sample-board/`,
        `https://new-server.${testHostnames.fiveChannel}/another-board/`,
      ),
    ).toBeNull();
    expect(
      resolveBoardMoveUrl(
        `https://old-server.${testHostnames.fiveChannel}/sample-board/`,
        "https://external.example.test/sample-board/",
        "https://external.example.test/sample-board/subject.txt",
      ),
    ).toBeNull();
  });

  it("サーバー移転でスレッドURLのパス・検索文字列・フラグメントを保つ", () => {
    expect(
      replaceBoardUrlServer(
        `https://old-server.${testHostnames.fiveChannel}/test/read.cgi/sample-board/123/45?q=1#res=45`,
        `https://new-server.${testHostnames.fiveChannel}/sample-board/`,
      ),
    ).toBe(
      `https://new-server.${testHostnames.fiveChannel}/test/read.cgi/sample-board/123/45?q=1#res=45`,
    );
  });

  it("本文内リンク照合では旧ドメインのサーバー部分を省いた候補も返す", () => {
    expect(
      getThreadReferenceKeys(
        `https://old-server.${testHostnames.oldFiveChannel}/sample-board/123/?q=1#res=4`,
      ),
    ).toEqual([
      `.${testHostnames.oldFiveChannel}/sample-board/123/?q=1#res=4`,
      `https://old-server.${testHostnames.oldFiveChannel}/sample-board/123/?q=1#res=4`,
    ]);
    expect(getThreadReferenceKeys("https://other.example.test/sample-board/123/")).toEqual([
      "https://other.example.test/sample-board/123/",
    ]);
  });
});
