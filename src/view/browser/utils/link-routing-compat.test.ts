import {
  getBoardUrlFromThreadUrl,
  parseInternalBrowserPageStrict,
  parseOmnibarBrowserPage,
} from "src/view/browser/utils/link-routing";
import { describe, expect, it, vi } from "vite-plus/test";

// 実在するスレッドURLを使わず、既知ホストと未知ホストの入力ポリシーを比較する。
vi.mock("packages/chlib/src/url/hosts", async (importOriginal) => {
  const library = await importOriginal<typeof import("packages/chlib/src/url/hosts")>();
  return {
    ...library,
    classifyBoardHost: (hostname: string) =>
      hostname === "bbs.example.com" ? "eddibb" : library.classifyBoardHost(hostname),
  };
});

describe("短縮URLの入力経路", () => {
  it.each(["/test/read.cgi/board-key/123/45", "/board-key/123/45", "/board-key/dat/123.dat"])(
    "既知の互換ホストでは %s をクリックと入力の両方で解決する",
    (path) => {
      const input = `https://bbs.example.com${path}?q=1#45`;
      // 元のURLの通信方式を維持する仕様（1ed9a91）に合わせ、HTTPSのまま解決する。
      const expected = {
        type: "thread",
        title: "https://bbs.example.com/test/read.cgi/board-key/123/?q=1#45",
        threadUrl: "https://bbs.example.com/test/read.cgi/board-key/123/?q=1#45",
      };
      expect(parseInternalBrowserPageStrict(input)).toEqual(expected);
      expect(parseOmnibarBrowserPage(input)).toEqual(expected);
      expect(getBoardUrlFromThreadUrl(input)).toBe("https://bbs.example.com/board-key/");
    },
  );

  it.each(["/board-key/123", "/board-key/123/", "/board-key/123/l50", "/board-key/123/L50/"])(
    "未知のホストでは %s をオムニバー入力時だけ推測する",
    (path) => {
      const input = `https://other.example.com${path}#45`;
      expect(parseInternalBrowserPageStrict(input)).toBeNull();
      expect(parseOmnibarBrowserPage(input)).toMatchObject({
        type: "thread",
        threadUrl: "https://other.example.com/test/read.cgi/board-key/123/#45",
      });
    },
  );

  it.each(["/board/123/45", "/board/123/other", "/board/thread-id"])(
    "未知のホストでは %s の末尾を安易に切り捨てない",
    (path) => {
      expect(parseOmnibarBrowserPage(`https://other.example.com${path}`)).toBeNull();
    },
  );

  it("互換ホストの旧read.cgi板形式を板本体へ解決する", () => {
    expect(
      parseInternalBrowserPageStrict("https://bbs.example.com/test/read.cgi/board-key/"),
    ).toMatchObject({
      type: "threadList",
      boardUrl: "https://bbs.example.com/board-key/",
    });
  });
});
