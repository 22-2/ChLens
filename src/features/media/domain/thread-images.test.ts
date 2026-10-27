import type { IRes } from "src/service-container/interfaces";
import { describe, expect, it } from "vite-plus/test";

import { collectThreadImages } from "./thread-images";

function res(num: number, message: string): IRes {
  return { num, name: "", mail: "", date: "", message };
}

describe("サイドパネルの画像一覧", () => {
  it("本文の画像だけを集め、同じ URL は最初のレスに出す", () => {
    const items = collectThreadImages(
      [
        res(1, "https://images.example.com/a.jpg 最初"),
        res(2, "https://images.example.com/a.jpg https://images.example.com/b.png"),
        res(3, "https://videos.example.com/c.mp4 https://example.com/page"),
      ],
      "https:",
    );
    expect(items.map((item) => [item.resNum, item.rawUrl])).toEqual([
      [1, "https://images.example.com/a.jpg"],
      [2, "https://images.example.com/b.png"],
    ]);
    expect(items[0].text).toContain("最初");
  });
});
