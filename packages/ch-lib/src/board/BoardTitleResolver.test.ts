import { describe, expect, it } from "vite-plus/test";
import { createBoardTitleRequest, resolveBoardTitle } from "./BoardTitleResolver";

describe("BoardTitleResolver", () => {
  it("2ch互換板のSETTING.TXT取得先と板名を解決する", () => {
    const request = createBoardTitleRequest("https://bbs.eddibb.cc/liveedge/");

    expect(request).toEqual({
      url: "https://bbs.eddibb.cc/liveedge/SETTING.TXT",
      charset: "shift_jis",
      source: "setting",
      fallbackTitle: "liveedge",
      boardTsld: "eddibb.cc",
    });
    expect(resolveBoardTitle(request!, "BBS_TITLE=予備\nBBS_TITLE_ORIG=実況板\n")).toBe("実況板");
  });

  it("したらば板は設定APIとEUC-JPを選ぶ", () => {
    const request = createBoardTitleRequest("https://jbbs.shitaraba.net/computer/12345/");

    expect(request).toMatchObject({
      url: "https://jbbs.shitaraba.net/bbs/api/setting.cgi/computer/12345/",
      charset: "euc-jp",
      source: "jbbs",
    });
    expect(resolveBoardTitle(request!, "BBS_TITLE=したらば板\n")).toBe("したらば板");
  });

  it("タイトルがない2ch互換板は板キーへフォールバックする", () => {
    const request = createBoardTitleRequest("https://bbs.eddibb.cc/liveedge/");

    expect(resolveBoardTitle(request!, "BBS_NONAME_NAME=名無し\n")).toBe("liveedge");
  });
});
