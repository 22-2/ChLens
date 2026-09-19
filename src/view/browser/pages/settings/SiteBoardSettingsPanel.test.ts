import { describe, expect, it } from "vite-plus/test";

import { mergeBoardOptions } from "./SiteBoardSettingsPanel";

describe("サイト・板設定の板候補", () => {
  it("同じ板のHTTP/HTTPS表記と旧EddibB形式を一つにまとめる", () => {
    expect(
      mergeBoardOptions([
        { url: "https://bbs.eddibb.cc/liveedge/", title: "エッヂ" },
        { url: "http://bbs.eddibb.cc/test/read.cgi/liveedge/", title: "エッヂ" },
      ]),
    ).toEqual([
      {
        site: "bbs.eddibb.cc",
        key: "https://bbs.eddibb.cc/liveedge/",
        title: "エッヂ",
      },
    ]);
  });
});
