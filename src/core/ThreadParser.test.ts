import { ChURL } from "packages/ch-lib/src/index";
import { getThreadXhrInfo, parseJbbsThread, parseThread } from "src/core/ThreadParser.js";
import { describe, expect, it } from "vite-plus/test";

describe("ThreadParser", () => {
  it("headline.5ch.io は format_2chnet=html でも dat URL を使う", () => {
    const url = new ChURL("https://headline.5ch.io/test/read.cgi/bbynamazu/1000000009/");

    const xhrInfo = getThreadXhrInfo(url, "html");

    expect(xhrInfo).not.toBeNull();
    expect(xhrInfo?.path).toBe("https://headline.5ch.io/bbynamazu/dat/1000000009.dat");
    expect(xhrInfo?.charset).toBe("Shift_JIS");
  });

  it("headline.5ch.io は format_2chnet=html でも dat 形式で解釈する", () => {
    const url = new ChURL("https://headline.5ch.io/test/read.cgi/bbynamazu/1000000009/");
    const datText = "名無しさん<>sage<>2026/05/01(金) 00:00:00.00 ID:abc<>本文<>スレタイ\n";

    const parsed = parseThread(url, datText, { format2chnet: "html" });

    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("スレタイ");
    expect(parsed?.res).toHaveLength(1);
    expect(parsed?.res[0].message).toBe("本文");
  });

  it("JBBS dat の欠番は あぼーん で補完する", () => {
    const text =
      "1<>名前1<>mail1<>日付1<>本文1<>タイトル<>id1\n3<>名前3<>mail3<>日付3<>本文3<>タイトル<>id3\n";

    const parsed = parseJbbsThread(text);

    expect(parsed).not.toBeNull();
    expect(parsed?.res).toHaveLength(3);
    expect(parsed?.res[1]).toEqual({
      name: "あぼーん",
      mail: "あぼーん",
      message: "あぼーん",
      other: "あぼーん",
    });
  });
});
