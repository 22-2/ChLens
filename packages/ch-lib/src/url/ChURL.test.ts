import { describe, expect, it } from "vite-plus/test";
import { ChURL } from "./ChURL";

describe("ChURL", () => {
  it("任意ドメインのdat直リンクをスレッドURLとして正規化する", () => {
    const url = new ChURL("https://bbs.example.test/flaming/dat/1000000001.dat");

    expect(url.type).toBe("thread");
    expect(url.url.href).toBe("https://bbs.example.test/test/read.cgi/flaming/1000000001/");
    expect(url.getDatUrl()).toBe("https://bbs.example.test/flaming/dat/1000000001.dat");
    expect(url.getSubjectUrl()).toBe("https://bbs.example.test/flaming/subject.txt");
  });

  it("レス番号付きのread.cgi URLをスレッド本体へ正規化する", () => {
    const url = new ChURL("https://kako.5ch.io/test/read.cgi/exampleboard/1000000008/20");

    expect(url.type).toBe("thread");
    expect(url.url.href).toBe("https://kako.5ch.io/test/read.cgi/exampleboard/1000000008/");
  });
});
