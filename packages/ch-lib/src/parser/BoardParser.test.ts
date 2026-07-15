import fs from "fs";
import { BoardParser } from "packages/ch-lib/src/parser/BoardParser";
import { ChURL } from "packages/ch-lib/src/url/ChURL";
import path from "path";
import { describe, expect, it } from "vite-plus/test";

describe("BoardParser", () => {
  it("should parse 5ch style subject.txt", () => {
    const url = new ChURL("https://egg.5ch.io/software/");
    const text =
      "1000000002.dat<>Thread Title (10)\n" +
      "1000000003.dat<>Another Thread [無断転載禁止] (100)\n";

    const result = BoardParser.parse(url, text);
    expect(result).toHaveLength(2);

    expect(result[0].title).toBe("Thread Title");
    expect(result[0].resCount).toBe(10);
    expect(result[0].url).toBe("https://egg.5ch.io/test/read.cgi/software/1000000002/");

    expect(result[1].title).toBe("Another Thread");
    expect(result[1].resCount).toBe(100);
  });

  it("should parse Shitaraba style subject.txt", () => {
    const url = new ChURL("https://jbbs.shitaraba.net/computer/12345/");
    const text =
      "1000000002.cgi,Thread Title(10)\n" +
      "1000000003.cgi,Another Thread(100)\n" +
      "1000000004.cgi,Sacrificial Thread(1)\n";

    const result = BoardParser.parse(url, text);
    expect(result).toHaveLength(2);

    expect(result[0].title).toBe("Thread Title");
    expect(result[0].resCount).toBe(10);
    expect(result[0].url).toBe(
      "https://jbbs.shitaraba.net/bbs/read.cgi/computer/12345/1000000002/",
    );
  });

  it("should parse bbyall_subject.txt (actual file)", () => {
    // Load the actual test file
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
