// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";

import { ChURL } from "./ChURL";

// 実在するスレッドURLを例示せずに、ホスト固有の互換処理を検証する。
vi.mock("./hosts", async (importOriginal) => {
  const hosts = await importOriginal<typeof import("./hosts")>();
  return { ...hosts, HOSTNAME: { ...hosts.HOSTNAME, EDDIBB: "bbs.example.com" } };
});

describe("互換ホストの共通URL判定", () => {
  it.each(["/test/read.cgi/board/123/45", "/board/123/45", "/board/dat/123.dat"])(
    "%s を共通のスレッド形式へ揃えてHTTP指定を維持する",
    (path) => {
      const url = new ChURL(`https://bbs.example.com${path}?q=1#45`);
      expect(url.type).toBe("thread");
      expect(url.url.href).toBe("http://bbs.example.com/test/read.cgi/board/123/?q=1#45");
      expect(url.getDatUrl()).toBe("http://bbs.example.com/board/dat/123.dat");
      expect(url.toBoard().url.href).toBe("http://bbs.example.com/board/");
    },
  );

  it.each(["/board", "/board/", "/test/read.cgi/board", "/test/read.cgi/board/"])(
    "%s の板判定では元のパスとHTTPSを維持する",
    (path) => {
      const url = new ChURL(`https://bbs.example.com${path}`);
      expect(url.type).toBe("board");
      expect(url.url.href).toBe(`https://bbs.example.com${path.replace(/\/$/, "")}/`);
    },
  );

  it("通常ホストでは短縮形式を推測せず、標準形式のHTTPSを維持する", () => {
    expect(new ChURL("https://other.example.com/board/123/").type).toBe("unknown");
    expect(new ChURL("https://other.example.com/test/read.cgi/board/123/").url.protocol).toBe(
      "https:",
    );
  });
});
