import { parseOpenedBoardEntries } from "src/view/browser/pages/board-list/board-list-utils";
import { describe, expect, it } from "vite-plus/test";

describe("parseOpenedBoardEntries", () => {
  it("外部サイトを除外し、同じ板の別URL表記をまとめる", () => {
    const entries = parseOpenedBoardEntries(
      JSON.stringify([
        { url: "https://twitter.com/home/", title: "Twitter" },
        { url: "https://bbs.eddibb.cc/liveedge/", title: "エッヂ" },
        {
          url: "http://bbs.eddibb.cc/test/read.cgi/liveedge/",
          title: "別名",
        },
      ]),
    );

    expect(entries).toEqual([{ url: "https://bbs.eddibb.cc/liveedge/", title: "エッヂ" }]);
  });

  it("壊れたJSONは空配列として扱う", () => {
    expect(parseOpenedBoardEntries("壊れた設定")).toEqual([]);
  });
});
