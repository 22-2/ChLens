import { ChURL } from "packages/ch-lib/src/index";
import {
  getThreadXhrInfo,
  isHtmlThread,
  parseJbbsThread,
  parseNetThread,
  parseThread,
} from "src/core/ThreadParser.js";
import { describe, expect, it } from "vite-plus/test";

describe("ThreadParser", () => {
  it("headline.5ch.io は format_2chnet=html でも dat URL を使う", () => {
    const url = new ChURL("https://headline.5ch.io/test/read.cgi/bbynamazu/1000000007/");

    const xhrInfo = getThreadXhrInfo(url, "html");

    expect(xhrInfo).not.toBeNull();
    expect(xhrInfo?.path).toBe("https://headline.5ch.io/bbynamazu/dat/1000000007.dat");
    expect(xhrInfo?.charset).toBe("Shift_JIS");
  });

  it("headline.5ch.io は format_2chnet=html でも dat 形式で解釈する", () => {
    const url = new ChURL("https://headline.5ch.io/test/read.cgi/bbynamazu/1000000007/");
    const datText = "名無しさん<>sage<>2026/05/01(金) 00:00:00.00 ID:abc<>本文<>スレタイ\n";

    const parsed = parseThread(url, datText, { format2chnet: "html" });

    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("スレタイ");
    expect(parsed?.res).toHaveLength(1);
    expect(parsed?.res[0].message).toBe("本文");
  });

  it("任意ドメインのdat直リンクを既存のdat取得・解析経路へ渡す", () => {
    const url = new ChURL("https://bbs.example.test/flaming/dat/1000000001.dat");
    const datText =
      "<><>2026/08/27(木) 12:00:00.00 ID:abc<>本文<>スレタイ\n" +
      "<><>2026/08/27(木) 12:05:00.00 ID:def<>二つ目<>\n";

    expect(getThreadXhrInfo(url, null)).toEqual({
      path: "https://bbs.example.test/flaming/dat/1000000001.dat",
      charset: "Shift_JIS",
    });

    const parsed = parseThread(url, datText);
    expect(parsed?.title).toBe("スレタイ");
    expect(parsed?.res).toHaveLength(2);
    expect(parsed?.res[0].name).toBe("名無し");
    expect(parsed?.res[1].name).toBe("名無し");
    expect(parsed?.res[0].message).toBe("本文");
    expect(parsed?.res[1].other).toContain("ID:def");
  });

  it("HTMLの空の名前欄を名無しで補完する", () => {
    const html =
      '<div id="threadtitle">タイトル</div>\n' +
      '<div id="1" class="clear post">' +
      '<div open="" class="post-header"><div><span class="postid">1</span>' +
      '<span class="postusername"><b></b></span></div>' +
      '<span style="width:100%;"><span class="date">2026/08/27(木) 12:00:00.00</span></span></div>' +
      '<div class="post-content"> 本文 </div></div>' +
      "<footer><br>read.cgi ver 07.7.45</footer>";

    const parsed = parseNetThread(html);

    expect(parsed?.res[0].name).toBe("名無し");
  });

  it("任意ドメインのread.cgiスレッドURLはdat取得経路で解析する", () => {
    const url = new ChURL("http://bbs.example.test/test/read.cgi/flaming/1000000002/");
    const datText = "<> <>2026/08/27(木) 12:00:00.00 ID:abc<>本文<>スレタイ\n";

    // 互換サーバー側がread.cgiをHTMLとして提供しなくても、URL構造からdatを選ぶ。
    expect(isHtmlThread(url, "html")).toBe(false);
    expect(getThreadXhrInfo(url, "html")).toEqual({
      path: "http://bbs.example.test/flaming/dat/1000000002.dat",
      charset: "Shift_JIS",
    });

    const parsed = parseThread(url, datText, { format2chnet: "html" });
    expect(parsed?.title).toBe("スレタイ");
    expect(parsed?.res).toHaveLength(1);
    expect(parsed?.res[0].message).toBe("本文");
  });

  it("現行HTMLのdata-useridとuidからレスIDを抽出する", () => {
    const html =
      '<div id="threadtitle">タイトル</div>\n' +
      '<div id="1" data-userid="ID:first" data-id="1" class="clear post">' +
      '<div open="" class="post-header"><div><span class="postid">1</span>' +
      '<span class="postusername"><b>名無しさん</b></span></div>' +
      '<span style="width:100%;"><span class="date">2026/08/27(木) 12:00:00.00</span>' +
      '<span class="uid">ID:second</span></span></div>' +
      '<div class="post-content"> 本文 </div></div>' +
      "<footer><br>read.cgi ver 07.7.45</footer>";

    const parsed = parseNetThread(html);

    expect(parsed).toEqual({
      title: "タイトル",
      res: [
        {
          name: "名無しさん",
          mail: "",
          message: "本文 ",
          other: "2026/08/27(木) 12:00:00.00 ID:second",
          id: "first",
        },
      ],
    });
  });

  it("現行HTMLのuidをID属性のフォールバックにし、不正な値を除外する", () => {
    const createHtml = (attributes: string, uidMarkup: string) =>
      '<div id="threadtitle">タイトル</div>\n' +
      `<div id="1" ${attributes} data-id="1" class="clear post">` +
      '<div open="" class="post-header"><div><span class="postid">1</span>' +
      '<span class="postusername"><b>名無しさん</b></span></div>' +
      '<span style="width:100%;"><span class="date">2026/08/27(木) 12:00:00.00</span>' +
      uidMarkup +
      "</span></div>" +
      '<div class="post-content"> 本文 </div></div>' +
      "<footer><br>read.cgi ver 07.7.45</footer>";

    const spanOnly = parseNetThread(createHtml("", '<span class="uid">ID:from-span</span>'));
    const invalid = parseNetThread(createHtml('data-userid="invalid"', ""));

    expect(spanOnly?.res[0].id).toBe("from-span");
    expect(invalid?.res[0].id).toBeUndefined();
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
