import { getBoardUrlKey, normalizeBBSMenus, normalizeBoardUrl } from "src/core/BoardUrlNormalizer";
import { describe, expect, it } from "vite-plus/test";

describe("normalizeBoardUrl", () => {
  it("スレッドURLを板URLへ変換して末尾形式を揃える", () => {
    expect(normalizeBoardUrl("https://bbs.eddibb.cc/test/read.cgi/liveedge/1000000001/")).toBe(
      "http://bbs.eddibb.cc/liveedge/",
    );
  });

  it("EddibBの旧形式と通常形式を同じ板キーへ変換する", () => {
    expect(getBoardUrlKey("https://bbs.eddibb.cc/liveedge/")).toBe(
      getBoardUrlKey("http://bbs.eddibb.cc/test/read.cgi/liveedge/"),
    );
  });

  it("既知の掲示板ホストだけに限定できる", () => {
    expect(normalizeBoardUrl("https://twitter.com/home/", { requireCompatibleHost: true })).toBe(
      null,
    );
    expect(normalizeBoardUrl("https://foo.5ch.io/software/", { requireCompatibleHost: true })).toBe(
      "https://foo.5ch.io/software/",
    );
  });

  it("既読情報用のワイルドカードホストを板URLとして受け入れない", () => {
    expect(normalizeBoardUrl("https://%2A.5ch.io/alone/", { requireCompatibleHost: true })).toBe(
      null,
    );
  });
});

describe("normalizeBBSMenus", () => {
  it("メニューをまたぐ重複板を最初の項目だけ残す", () => {
    const menus = normalizeBBSMenus([
      {
        name: "メニュー1",
        categories: [
          {
            name: "カテゴリ1",
            boards: [{ name: "最初の名前", url: "https://bbs.eddibb.cc/liveedge/" }],
          },
        ],
      },
      {
        name: "メニュー2",
        categories: [
          {
            name: "カテゴリ2",
            boards: [
              {
                name: "重複した名前",
                url: "http://bbs.eddibb.cc/test/read.cgi/liveedge/",
              },
            ],
          },
        ],
      },
    ]);

    expect(menus).toHaveLength(1);
    expect(menus[0].categories[0].boards).toEqual([
      { name: "最初の名前", url: "https://bbs.eddibb.cc/liveedge/" },
    ]);
  });

  it("その他メニューから既知の掲示板ではないURLを除く", () => {
    const menus = normalizeBBSMenus([
      {
        name: "その他",
        categories: [
          {
            name: "一度開いた板",
            boards: [
              { name: "Twitter", url: "https://twitter.com/home/" },
              { name: "板", url: "https://foo.5ch.io/live/" },
            ],
          },
        ],
      },
    ]);

    expect(menus[0].categories[0].boards).toEqual([
      { name: "板", url: "https://foo.5ch.io/live/" },
    ]);
  });
});
