// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { normalizeBBSMenus } from "./BBSMenuNormalizer";

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
