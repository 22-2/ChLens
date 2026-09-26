import { decode } from "@toon-format/toon";
import { encodeBrowsingHistoryForMcp, encodeWriteHistoryForMcp } from "src/mcp/history-output";
import { describe, expect, it } from "vite-plus/test";

describe("MCP向け履歴出力", () => {
  it("書き込み履歴を投稿内容付きTOONへ変換する", () => {
    const toon = encodeWriteHistoryForMcp("テスト", [
      {
        id: 1,
        url: "https://example.com/test/read.cgi/board/1/",
        res: 42,
        title: "テストスレ",
        name: "名無しさん",
        mail: "sage",
        message: "本文",
        date: 1_789_000_000_000,
      },
    ]);

    const decoded = decode(toon) as {
      writes: Array<{
        id: number;
        url: string;
        res: number;
        title: string;
        name: string;
        mail: string;
        message: string;
        date: string;
      }>;
      query: string;
      count: number;
    };
    expect(decoded.query).toBe("テスト");
    expect(decoded.count).toBe(1);
    expect(decoded.writes).toEqual([
      expect.objectContaining({
        id: 1,
        url: "https://example.com/test/read.cgi/board/1/",
        res: 42,
        title: "テストスレ",
        message: "本文",
      }),
    ]);
    expect(typeof decoded.writes[0].date).toBe("string");
  });

  it("閲覧履歴を板名付きTOONへ変換する", () => {
    const toon = encodeBrowsingHistoryForMcp("", [
      {
        url: "https://example.com/test/read.cgi/board/1/",
        title: "テストスレ",
        boardTitle: "テスト板",
        date: 1_789_000_000_000,
      },
    ]);

    const decoded = decode(toon) as {
      history: Array<{ url: string; title: string; board: string; date: string }>;
      query: string;
      count: number;
    };
    expect(decoded.count).toBe(1);
    expect(decoded.history).toEqual([
      expect.objectContaining({
        url: "https://example.com/test/read.cgi/board/1/",
        title: "テストスレ",
        board: "テスト板",
      }),
    ]);
  });
});
