import { decode } from "@toon-format/toon";
import { encodeThreadForMcp, selectThreadResponses } from "src/mcp/thread-output";
import type { IRes } from "src/service-container/interfaces";
import { describe, expect, it } from "vite-plus/test";

const responses: IRes[] = [
  {
    num: 1,
    name: "名無しさん",
    mail: "",
    date: "2026/09/12(土) 12:00:00",
    message: "起点",
  },
  {
    num: 2,
    name: "名無しさん",
    mail: "",
    date: "2026/09/12(土) 12:01:00",
    message: "&gt;&gt;1 返信",
  },
  {
    num: 3,
    name: "名無しさん",
    mail: "",
    date: "2026/09/12(土) 12:02:00",
    message: ">>1 もう一度返信<br>本文",
  },
];

describe("MCP向けスレッド出力", () => {
  it("人気レスを返信メタデータ付きTOONへ変換する", () => {
    const encoded = encodeThreadForMcp(
      {
        title: "テストスレ",
        url: "https://example.com/test/read.cgi/board/1/",
        res: responses,
      },
      { popular: 1 },
      "cache",
    );

    const decoded = decode(encoded.toon) as {
      thread: { selection: string; source: string };
      responses: Array<{
        num: number;
        message: string;
        replyCount: number;
        repliedBy: string;
      }>;
    };
    expect(decoded.thread).toMatchObject({ selection: "popular", source: "cache" });
    expect(decoded.responses).toEqual([
      expect.objectContaining({ num: 1, replyCount: 2, repliedBy: "2,3" }),
    ]);
  });

  it("範囲指定を先頭・末尾指定より優先し、本文のHTMLを除去する", () => {
    const selection = selectThreadResponses(responses, { start: 2, end: 3, first: 1 });
    expect(selection.mode).toBe("range");
    expect(selection.responses.map((response) => response.num)).toEqual([2, 3]);

    const encoded = encodeThreadForMcp(
      { title: "テスト", url: "https://example.com/thread/1/", res: responses },
      { first: 3 },
      "auto",
    );
    const decoded = decode(encoded.toon) as {
      responses: Array<{ num: number; message: string }>;
    };
    expect(decoded.responses.find((response) => response.num === 3)).toEqual(
      expect.objectContaining({ num: 3, message: ">>1 もう一度返信\n本文" }),
    );
  });
});
