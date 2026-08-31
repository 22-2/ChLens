import fs from "fs";
import path from "path";
import { describe, expect, it } from "vite-plus/test";
import { BoardParser } from "../parser/BoardParser";
import { ChURL } from "../url/ChURL";

describe("BoardParser", () => {
  it("5ch形式のsubject.txtを解析する", () => {
    const url = new ChURL("https://egg.5ch.io/software/");
    const text =
      "1000000001.dat<>Thread Title (10)\n" +
      "1000000002.dat<>Another Thread [無断転載禁止] (100)\n";

    const result = BoardParser.parse(url, text);
    expect(result).toHaveLength(2);

    expect(result[0].title).toBe("Thread Title");
    expect(result[0].resCount).toBe(10);
    expect(result[0].url).toBe("https://egg.5ch.io/test/read.cgi/software/1000000001/");

    expect(result[1].title).toBe("Another Thread");
    expect(result[1].resCount).toBe(100);
  });

  it("したらば形式のsubject.txtを解析する", () => {
    const url = new ChURL("https://jbbs.shitaraba.net/computer/12345/");
    const text =
      "1000000001.cgi,Thread Title(10)\n" +
      "1000000002.cgi,Another Thread(100)\n" +
      "1000000003.cgi,Sacrificial Thread(1)\n";

    const result = BoardParser.parse(url, text);
    expect(result).toHaveLength(2);

    expect(result[0].title).toBe("Thread Title");
    expect(result[0].resCount).toBe(10);
    expect(result[0].url).toBe(
      "https://jbbs.shitaraba.net/bbs/read.cgi/computer/12345/1000000001/",
    );
  });

  it("実ファイルのbbyall_subject.txtを解析する", () => {
    // 実際のテストファイルを読み込む
    const testFilePath = path.join(
      import.meta.dirname,
      "../../../../src/core/__test__/bbyall_subject.txt",
    );
    const buffer = fs.readFileSync(testFilePath);
    const text = new TextDecoder("shift-jis").decode(buffer);

    const url = new ChURL("https://bbypink.5ch.io/test/");
    const result = BoardParser.parse(url, text);

    console.log(`Parsed: ${result.length} threads`);
    if (result.length > 0) {
      console.log(`First: ${result[0].title} (${result[0].resCount} res)`);
      console.log(`Expected >= 1, got ${result.length}`);
    }

    expect(result.length).toBeGreaterThan(0);
  });
});
