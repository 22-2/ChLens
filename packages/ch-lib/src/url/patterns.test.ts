import { describe, expect, it } from "vite-plus/test";

import { PATTERNS, ROUTE_PATTERNS } from "./patterns";

describe("URLパターンの互換性", () => {
  // 共通化で捕捉グループが増えると、正規化先の板名やレス番号がずれるため値まで確認する。
  it.each([
    [PATTERNS.CH_DAT, "/board-key/dat/123.dat/", ["board-key", "123"]],
    [ROUTE_PATTERNS.CH_DAT, "/board-key/dat/123.dat", ["board-key", "123"]],
    [PATTERNS.MACHI_THREAD, "/bbs/read.cgi/board/123/45", ["board/123"]],
    [PATTERNS.MACHI_RESNUM, "/bbs/read.cgi/board/123/45", ["45"]],
    [ROUTE_PATTERNS.MACHI_THREAD, "/bbs/read.cgi/board-key/123/45", ["board-key", "123"]],
    [PATTERNS.SHITARABA_THREAD, "/bbs/read.cgi/board/12/123/45", ["read.cgi/board/12/123"]],
    [PATTERNS.SHITARABA_RESNUM, "/bbs/read_archive.cgi/board/12/123/45", ["45"]],
    [PATTERNS.SHITARABA_TO_BOARD, "/bbs/read_archive.cgi/board/12/123/", ["board/12"]],
    [
      ROUTE_PATTERNS.SHITARABA_THREAD,
      "/bbs/read.cgi/board-key/12/123/45",
      ["board-key", "12", "123"],
    ],
    [
      ROUTE_PATTERNS.SHITARABA_THREAD,
      "/bbs/read_archive.cgi/board/12/123/",
      ["board", "12", "123"],
    ],
    [
      ROUTE_PATTERNS.CH_STYLE_THREAD,
      "/server-key/test/read.cgi/board-key/123/45",
      ["server-key/test/read.cgi/board-key/123"],
    ],
    [
      ROUTE_PATTERNS.CH_STYLE_BOARD_FROM_THREAD,
      "/server-key/test/read.cgi/board-key/123/45",
      ["board-key"],
    ],
    [ROUTE_PATTERNS.CH_STYLE_THREAD, "/test/read.cgi/board/123", ["test/read.cgi/board/123"]],
    [ROUTE_PATTERNS.CH_STYLE_BOARD_FROM_THREAD, "/test/read.cgi/board/123", ["board"]],
    [PATTERNS.CH_SHORT_THREAD, "/board/123/45", ["board", "123"]],
    [PATTERNS.CH_BOARD_KEY, "/board", ["board"]],
    [PATTERNS.CH_BOARD_KEY, "/test/read.cgi/board/", ["board"]],
    [ROUTE_PATTERNS.CH_SHORT_THREAD, "/board-key/123/45", ["board-key", "123"]],
    [ROUTE_PATTERNS.CH_BOARD_KEY, "/test/read.cgi/board-key/", ["board-key"]],
    [ROUTE_PATTERNS.OMNIBAR_SHORT_THREAD, "/board-key/123/l50/", ["board-key", "123"]],
    [ROUTE_PATTERNS.OMNIBAR_SHORT_THREAD, "/board-key/123/L50", ["board-key", "123"]],
  ] as const)("%s が %s から既存の捕捉値を返す", (pattern, path, captures) => {
    expect(pattern.exec(path)?.slice(1)).toEqual(captures);
  });

  // 完全一致の判定と接頭辞の判定、用途ごとのハイフン許容は意図的に異なる。
  it.each([
    [PATTERNS.CH_DAT, "/board/dat/123.dat/45"],
    [ROUTE_PATTERNS.CH_DAT, "/board/dat/123.dat?x=1"],
    [PATTERNS.MACHI_THREAD, "/bbs/read.cgi/board-key/123/"],
    [PATTERNS.SHITARABA_THREAD, "/bbs/read.cgi/board-key/12/123/"],
    [PATTERNS.SHITARABA_TO_BOARD, "/bbs/read.cgi/board/12/123/45"],
    [ROUTE_PATTERNS.CH_STYLE_THREAD, "/test/-/board/123/"],
    [ROUTE_PATTERNS.MACHI_THREAD, "/bbs/read_archive.cgi/board/123/"],
    [PATTERNS.CH_SHORT_THREAD, "/board-key/123/"],
    [ROUTE_PATTERNS.OMNIBAR_SHORT_THREAD, "/board/123/45"],
    [ROUTE_PATTERNS.OMNIBAR_SHORT_THREAD, "/board/123/other"],
    [ROUTE_PATTERNS.OMNIBAR_SHORT_THREAD, "/test/read.cgi/board/123/"],
  ] as const)("%s が対象外の %s を拒否する", (pattern, path) => {
    expect(pattern.test(path)).toBe(false);
  });
});
