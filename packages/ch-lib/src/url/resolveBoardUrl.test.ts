import { describe, expect, it } from "vite-plus/test";

import { HOSTNAME } from "./hosts";
import { getBoardUrlFromThreadUrl, resolveBoardUrl } from "./resolveBoardUrl";

function urlWithHost(hostname: string, path: string): string {
  const url = new URL(`https://example.com${path}`);
  url.hostname = hostname;
  return url.href;
}

describe("掲示板URLの意味解決", () => {
  it("標準スレッドURLから正規URL、レス番号、板とスレッドの識別子を返す", () => {
    const result = resolveBoardUrl(
      "https://example.com/test/read.cgi/board-key/1234567890/45?q=sample#res45",
      { mode: "strict" },
    );

    expect(result).toEqual({
      type: "thread",
      url: "https://example.com/test/read.cgi/board-key/1234567890/?q=sample#res45",
      threadUrl: "https://example.com/test/read.cgi/board-key/1234567890/?q=sample#res45",
      boardUrl: "https://example.com/board-key/",
      threadKey: "example.com/test/read.cgi/board-key/1234567890/",
      boardKey: "example.com/board-key/",
      boardName: "board-key",
      threadId: "1234567890",
      resNumber: "45",
      bbsType: "2ch",
      isArchive: false,
    });
  });

  it("test/-形式も板とスレッドを解決し、レス番号を正規URLから除く", () => {
    expect(
      resolveBoardUrl("https://example.com/server-key/test/-/board-key/123/45#res=45", {
        mode: "strict",
      }),
    ).toMatchObject({
      type: "thread",
      threadUrl: "https://example.com/server-key/test/-/board-key/123/#res=45",
      boardUrl: "https://example.com/board-key/",
      boardKey: "example.com/board-key/",
      boardName: "board-key",
      threadId: "123",
      resNumber: "45",
    });
  });

  it("サーバー名付きURLでも板識別子を保ち、別スレッドの板キーを揃える", () => {
    const first = resolveBoardUrl("https://example.com/server-key/test/read.cgi/board-key/123/", {
      mode: "strict",
    });
    const second = resolveBoardUrl("https://example.com/server-key/test/read.cgi/board-key/456/", {
      mode: "strict",
    });

    expect(first).toMatchObject({
      type: "thread",
      boardUrl: "https://example.com/board-key/",
      boardName: "board-key",
      threadId: "123",
    });
    expect(first?.boardKey).toBe(second?.boardKey);
  });

  it("板形式はbrowseで扱い、未知ホストの短縮スレ形式はguessだけで推測する", () => {
    expect(resolveBoardUrl("https://example.com/board-key/", { mode: "strict" })).toBeNull();
    expect(resolveBoardUrl("https://example.com/board-key/", { mode: "browse" })).toMatchObject({
      type: "board",
      boardUrl: "https://example.com/board-key/",
      boardName: "board-key",
    });
    expect(resolveBoardUrl("https://example.com/board-key/123/l50", { mode: "browse" })).toBeNull();
    expect(
      resolveBoardUrl("https://example.com/board-key/123/l50", { mode: "guess" }),
    ).toMatchObject({
      type: "thread",
      threadUrl: "https://example.com/test/read.cgi/board-key/123/",
      boardUrl: "https://example.com/board-key/",
      threadId: "123",
    });
  });

  it("itestのgレス指定を解決し、注入されたサーバー情報を使う", () => {
    const result = resolveBoardUrl(
      urlWithHost(HOSTNAME.ITEST_5CH, "/server-key/test/read.cgi/board-key/123/g?g=45#res45"),
      { mode: "browse", resolveServerHostname: () => "mapped.example.test" },
    );

    expect(result).toMatchObject({
      type: "thread",
      threadUrl: "https://mapped.example.test/test/read.cgi/board-key/123/?g=45#res45",
      boardUrl: "https://mapped.example.test/board-key/",
      threadId: "123",
      resNumber: "45",
    });
  });

  it("itest短縮スレッドURLでもサーバーマップを適用する", () => {
    expect(
      getBoardUrlFromThreadUrl(urlWithHost(HOSTNAME.ITEST_5CH, "/board-key/123/"), {
        resolveServerHostname: (boardKey, network) =>
          boardKey === "board-key" && network === "5ch" ? "mapped.example.test" : null,
      }),
    ).toBe("https://mapped.example.test/board-key/");
  });

  it("itestのkako形式をarchive threadとして扱う", () => {
    expect(
      resolveBoardUrl(urlWithHost(HOSTNAME.ITEST_5CH, "/kako/test/read.cgi/board-key/123/"), {
        mode: "browse",
      }),
    ).toMatchObject({
      type: "thread",
      threadUrl: `https://kako.${HOSTNAME.NEW_5CH}/test/read.cgi/board-key/123/`,
      boardUrl: `https://kako.${HOSTNAME.NEW_5CH}/board-key/`,
      boardKey: `kako.${HOSTNAME.NEW_5CH}/board-key/`,
      isArchive: true,
    });
  });

  it("まちBBSとしたらば過去ログでも板URLを別々のスレッドから正しく導く", () => {
    const machi = resolveBoardUrl(
      urlWithHost(`boards.example.${HOSTNAME.MACHI}`, "/bbs/read.cgi/sample-board/123/45"),
      {
        mode: "strict",
      },
    );
    const shitaraba = resolveBoardUrl(
      urlWithHost(HOSTNAME.NEW_JBBS, "/sample-server/12/storage/123.html"),
      { mode: "strict" },
    );

    expect(machi).toMatchObject({
      type: "thread",
      boardUrl: `https://boards.example.${HOSTNAME.MACHI}/sample-board/`,
      boardName: "sample-board",
      threadId: "123",
      resNumber: "45",
      bbsType: "machi",
    });
    expect(shitaraba).toMatchObject({
      type: "thread",
      boardUrl: `https://${HOSTNAME.NEW_JBBS}/sample-server/12/`,
      boardName: "sample-server/12",
      threadId: "123",
      bbsType: "jbbs",
      isArchive: true,
    });
  });

  it("旧ULAホストを含むスレッドURLも移転先の板へ解決する", () => {
    expect(
      resolveBoardUrl(
        urlWithHost(
          `ula.${HOSTNAME.OLD_2CH}`,
          `/2ch/board-key/server-key.${HOSTNAME.OLD_5CH_NET}/123/45`,
        ),
        { mode: "strict" },
      ),
    ).toMatchObject({
      type: "thread",
      threadUrl: `https://server-key.${HOSTNAME.NEW_5CH}/test/read.cgi/board-key/123/`,
      boardUrl: `https://server-key.${HOSTNAME.NEW_5CH}/board-key/`,
      boardName: "board-key",
      threadId: "123",
      resNumber: "45",
    });
  });

  it("既存の板URL導出では入力のschemeを保ちながらitestのhostも解決する", () => {
    expect(
      getBoardUrlFromThreadUrl(urlWithHost(HOSTNAME.ITEST_5CH, "/board-key/123/"), {
        resolveServerHostname: () => "mapped.example.test",
      }),
    ).toBe("https://mapped.example.test/board-key/");
  });
});
