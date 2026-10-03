import { describe, expect, it } from "vite-plus/test";

import { matchesRuleSites } from "./scope";

describe("URLからのルール適用先判定", () => {
  // 標準形式と短縮形式の判定を整理しても、板に限定したルールの適用先を維持する。
  it.each([
    "/test/read.cgi/board/123/45",
    "/board/123/45",
    "/test/read.cgi/board",
    "/board",
    "/board/",
  ])("%s から板名を取り出す", (path) => {
    const url = `https://bbs.example.com${path}`;
    expect(matchesRuleSites(["bbs.example.com/board"], url)).toBe(true);
    expect(matchesRuleSites(["bbs.example.com/other"], url)).toBe(false);
  });
});
