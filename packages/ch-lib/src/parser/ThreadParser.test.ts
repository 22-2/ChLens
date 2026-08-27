import { describe, expect, it } from "vite-plus/test";
import { ThreadParser } from "../parser/ThreadParser";
import { ChURL } from "../url/ChURL";

describe("ThreadParser", () => {
  it("should parse 2ch style dat with metadata", () => {
    const url = new ChURL("https://egg.5ch.io/test/read.cgi/software/1000000001/");
    const dat =
      "Name1</b>(Slip 1)<b><>Mail1<>2026/03/06(金) 12:00:00.00 ID:TestImage5<>Message1<>Thread Title\n" +
      "Name2</b>◆Trip2<b><>Mail2<>2026/03/06(金) 12:05:00.00 ID:def67890<>Message2<>\n";

    const result = ThreadParser.parse(url, dat);
    expect(result.title).toBe("Thread Title");
    expect(result.posts).toHaveLength(2);

    expect(result.posts[0].name).toBe("Name1</b>(Slip 1)<b>");
    expect(result.posts[0].id).toBe("TestImage5");
    expect(result.posts[0].slip).toBe("Slip 1");

    expect(result.posts[1].name).toBe("Name2</b>◆Trip2<b>");
    expect(result.posts[1].id).toBe("def67890");
    expect(result.posts[1].trip).toBe("◆Trip2");
  });

  it("should use 名無し when a 2ch dat name field is empty", () => {
    const url = new ChURL("https://egg.5ch.io/test/read.cgi/software/1000000001/");
    const dat = "<><>2026/03/06(金) 12:00:00.00 ID:empty<>Message<>Thread Title\n";

    const result = ThreadParser.parse(url, dat);

    expect(result.posts[0].name).toBe("名無し");
  });

  it("should parse Shitaraba archive HTML into the canonical thread shape", () => {
    const url = new ChURL("https://jbbs.shitaraba.net/bbs/read_archive.cgi/computer/12345/100/");
    const html = `
      <h1>過去ログのタイトル</h1><dl>
      <dt>1 ：<a href="mailto:"><b>名無しさん</b></a> ：2026/08/23(日) 12:00:00.00 ID:first</dt>
      <dd>最初の本文<br></dd><br><br>
      <dt>2 ：<b>二人目</b> ：2026/08/23(日) 12:05:00.00 ID:second</dt>
      <dd>二つ目の本文<br></dd><br><br>
    `;

    const result = ThreadParser.parse(url, html);

    expect(result.title).toBe("過去ログのタイトル");
    expect(result.posts).toEqual([
      expect.objectContaining({
        number: 1,
        name: "名無しさん",
        date: "2026/08/23(日) 12:00:00.00 ID:first",
        message: "最初の本文",
      }),
      expect.objectContaining({ number: 2, name: "二人目", id: "second", message: "二つ目の本文" }),
    ]);
  });
});
