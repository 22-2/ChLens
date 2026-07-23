import { decode } from "@toon-format/toon";
import { encodeThreadAsToon, estimateToonTokenCount } from "src/view/browser/utils/thread-toon";
import { describe, expect, it } from "vite-plus/test";

describe("thread TOON", () => {
  it("スレ情報と全レスをTOONへ可逆変換する", () => {
    const encoded = encodeThreadAsToon({
      title: "テストスレ",
      url: "https://example.com/thread/1/",
      res: [
        {
          num: 1,
          name: "<b>名無しさん</b>",
          mail: "sage",
          date: "2026/07/23(木) 12:34:56",
          id: "abc123",
          message: "1行目<br>2行目 &amp; 続き",
        },
        {
          num: 2,
          name: "二人目",
          mail: "",
          date: "2026/07/23(木) 12:35:56",
          slip: "ﾜｯﾁｮｲ 1234-abcd",
          trip: "◆trip",
          be: "BE:123-ABC(1)",
          message: "返信",
        },
      ],
    });

    expect(encoded).toContain("responses[2]{num,date,id,message}:");
    expect(decode(encoded)).toEqual({
      title: "テストスレ",
      url: "https://example.com/thread/1/",
      responses: [
        {
          num: 1,
          date: "2026/07/23(木) 12:34:56",
          id: "abc123",
          message: "1行目\n2行目 & 続き",
        },
        {
          num: 2,
          date: "2026/07/23(木) 12:35:56",
          id: "",
          message: "返信",
        },
      ],
    });
  });

  it("UTF-8のバイト数からトークン数を推定する", () => {
    expect(estimateToonTokenCount("Hello, world!")).toBe(4);
    expect(estimateToonTokenCount("日本語")).toBe(3);
  });
});
