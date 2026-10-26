import iconv from "iconv-lite";
import { describe, expect, it } from "vite-plus/test";

import { encodeKakikomiTxt, formatKakikomiTxt, type KakikomiTxtEntry } from "./kakikomi-export";

describe("kakikomi.txtエクスポート", () => {
  it("Jane形式の区切りと項目、CRLF、末尾の空行を出力する", () => {
    const date = new Date(2026, 0, 2, 3, 4, 5).getTime();
    const entries: KakikomiTxtEntry[] = [
      {
        url: "http://example.com/test/read.cgi/sample/123/",
        title: "サンプルスレ",
        name: "名無しさん",
        mail: "sage",
        message: "本文1\n本文2",
        date,
      },
      {
        url: "http://example.com/test/read.cgi/sample/456/",
        title: "次のスレ",
        name: "",
        mail: "",
        message: "二つ目",
        date: 0,
      },
    ];

    expect(formatKakikomiTxt(entries)).toBe(
      [
        "--------------------------------------------",
        "Date   : 2026/01/02 03:04:05",
        "Subject: サンプルスレ",
        "URL    : http://example.com/test/read.cgi/sample/123/",
        "FROM   : 名無しさん",
        "MAIL   : sage",
        "",
        "本文1\r\n本文2",
        "",
        "",
        "--------------------------------------------",
        "Date   : ----/--/-- --:--:--",
        "Subject: 次のスレ",
        "URL    : http://example.com/test/read.cgi/sample/456/",
        "FROM   : ",
        "MAIL   : ",
        "",
        "二つ目",
        "",
        "",
        "",
      ].join("\r\n"),
    );
  });

  it("日本語を含む出力をShift-JISでエンコードする", () => {
    const entry: KakikomiTxtEntry = {
      url: "http://example.com/test/read.cgi/sample/1/",
      title: "日本語タイトル",
      name: "名無しさん",
      mail: "sage",
      message: "本文です",
      date: new Date(2026, 0, 2, 3, 4, 5).getTime(),
    };
    const encoded = encodeKakikomiTxt([entry]);

    expect(encoded[0]).toBe(0x2d);
    expect(iconv.decode(encoded, "shift_jis")).toBe(formatKakikomiTxt([entry]));
  });

  it("ヘッダー項目の改行を空白へ置き換える", () => {
    const entry: KakikomiTxtEntry = {
      url: "http://example.com/test/read.cgi/sample/1/",
      title: "タイトル\r\nSubject: 偽装",
      name: "名前\nFROM: 偽装",
      mail: "sage",
      message: "本文",
      date: new Date(2026, 0, 2).getTime(),
    };

    const text = formatKakikomiTxt([entry]);

    expect(text).toContain("Subject: タイトル Subject: 偽装");
    expect(text).toContain("FROM   : 名前 FROM: 偽装");
  });
});
