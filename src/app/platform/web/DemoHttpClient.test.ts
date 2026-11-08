import { describe, expect, it, vi } from "vite-plus/test";

import { DemoHttpClient } from "./DemoHttpClient";

describe("架空掲示板のデモ通信", () => {
  it("板一覧・スレッド一覧・本文を外部通信せずに返す", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      expect((await DemoHttpClient.fetch("https://example.com/bbsmenu.html")).body).toContain(
        "デモ掲示板",
      );
      expect((await DemoHttpClient.fetch("https://example.com/demo/subject.txt")).body).toContain(
        "はじめてのスレッド",
      );
      expect(
        (await DemoHttpClient.fetch("https://example.com/demo/dat/1700000001.dat")).body,
      ).toContain("架空のスレッド");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("実在サイトへの取得と書き込みを拒否する", async () => {
    await expect(DemoHttpClient.fetch("https://other.example.org/demo/")).rejects.toThrow(
      "架空の掲示板",
    );
    await expect(
      DemoHttpClient.fetch("https://example.com/demo/", { method: "POST" }),
    ).rejects.toThrow("書き込みできません");
    expect((await DemoHttpClient.fetch("https://example.com/missing")).status).toBe(404);
  });
});
