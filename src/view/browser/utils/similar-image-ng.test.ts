import "@testing-library/jest-dom/vitest";
import { Hash } from "browser-image-hash";
import type { Rule } from "@chlen/ch-lib";
import type { IRes } from "src/service-container/interfaces";
import {
  checkSimilarImages,
  extractImageUrlsFromRes,
  getSimilarImageNgRules,
  parseSimilarImageHash,
} from "src/view/browser/utils/similar-image-ng";
import { describe, expect, it, vi } from "vite-plus/test";

function createRes(message: string): IRes {
  return {
    num: 1,
    name: "名無しさん",
    mail: "",
    date: "2026/09/05",
    message,
  };
}

function createRule(overrides: Partial<Rule> = {}): Rule {
  return {
    action: "blur",
    target: "similar-image",
    enabled: true,
    matchers: [{ kind: "contains", value: "0123456789abcdef" }],
    ...overrides,
  };
}

describe("similar-image-ng", () => {
  it("16進表記と64ビット二進表記のdHashを読み込む", () => {
    expect(parseSimilarImageHash("0123456789abcdef")?.toString()).toBe("0123456789abcdef");
    expect(
      parseSimilarImageHash(
        "0000000100100011010001010110011110001001101010111100110111101111",
      )?.toString(),
    ).toBe("0123456789abcdef");
    expect(parseSimilarImageHash("0123456789abcde")).toBeNull();
    expect(parseSimilarImageHash("not-a-hash")).toBeNull();
  });

  it("レス本文から表示経路と同じ画像URLだけを抽出する", () => {
    expect(
      extractImageUrlsFromRes(
        createRes(
          "https://example.com/image.jpg https://imgur.com/TestImage https://example.com/movie.mp4",
        ),
      ),
    ).toEqual(["https://example.com/image.jpg", "https://i.imgur.com/TestImagem.jpg"]);
  });

  it("有効なルールだけを取り出し、サイトとthresholdを適用する", () => {
    const rules = getSimilarImageNgRules(
      [
        createRule({ scope: { sites: ["bbs.eddibb.cc"] }, parameters: { threshold: "12" } }),
        createRule({ parameters: { threshold: "65" } }),
        createRule({ enabled: false }),
        createRule({ action: "hide" }),
      ],
      "https://bbs.eddibb.cc/test/read.cgi/liveedge/1",
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.threshold).toBe(12);
    expect(rules[0]?.hash.toString()).toBe("0123456789abcdef");
  });

  it("画像ハッシュが閾値以内なら一致し、取得失敗後も次の画像を評価する", async () => {
    const targetHash = new Hash("0000000000000000000000000000000000000000000000000000000000000000");
    const imageHash = new Hash("0000000000000000000000000000000000000000000000000000000000000001");
    const hashBuilder = {
      build: vi
        .fn()
        .mockRejectedValueOnce(new Error("画像が見つかりません"))
        .mockResolvedValueOnce(imageHash),
    };

    await expect(
      checkSimilarImages(
        ["https://example.com/missing.jpg", "https://example.com/match.jpg"],
        [{ hash: targetHash, threshold: 1 }],
        { hashBuilder },
      ),
    ).resolves.toBe(true);
    expect(hashBuilder.build).toHaveBeenCalledTimes(2);
  });

  it("ハッシュ距離が閾値を超えた画像は一致させない", async () => {
    const hashBuilder = {
      build: vi
        .fn()
        .mockResolvedValue(
          new Hash("1111111111111111111111111111111111111111111111111111111111111111"),
        ),
    };

    await expect(
      checkSimilarImages(
        ["https://example.com/image.jpg"],
        [
          {
            hash: new Hash("0000000000000000000000000000000000000000000000000000000000000000"),
            threshold: 0,
          },
        ],
        { hashBuilder },
      ),
    ).resolves.toBe(false);
  });
});
