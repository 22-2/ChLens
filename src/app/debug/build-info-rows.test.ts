import { describe, expect, it } from "vite-plus/test";

import { buildInfoRows } from "./build-info-rows";

const INFO = {
  version: "1.2.3",
  buildTime: "2026-10-31T03:04:05.000Z",
  gitHash: "abc1234",
  author: "テスト作者",
  license: "MIT",
  repositoryUrl: "https://example.com/test-owner/chlens",
};

describe("版情報の一覧", () => {
  it("項目名と並び順は、ChLensについてのページと報告用の情報で同じ", () => {
    expect(buildInfoRows(INFO).map((row) => [row.key, row.label])).toEqual([
      ["version", "バージョン"],
      ["buildTime", "ビルド時刻"],
      ["gitHash", "Gitハッシュ"],
      ["author", "作者"],
      ["repositoryUrl", "リポジトリ"],
      ["license", "ライセンス"],
    ]);
  });

  it("ビルド時刻は、ログと同じ日本時間の形式で表す", () => {
    const buildTime = buildInfoRows(INFO).find((row) => row.key === "buildTime");

    expect(buildTime?.value).toBe("2026-10-31T12:04:05.000+09:00");
  });

  it("版・ハッシュ・作者・リポジトリ・ライセンスは、そのままの値で表す", () => {
    const values = Object.fromEntries(buildInfoRows(INFO).map((row) => [row.key, row.value]));

    expect(values).toMatchObject({
      version: "1.2.3",
      gitHash: "abc1234",
      author: "テスト作者",
      repositoryUrl: "https://example.com/test-owner/chlens",
      license: "MIT",
    });
  });
});
