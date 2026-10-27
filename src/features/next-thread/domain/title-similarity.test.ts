// @vitest-environment node
import {
  calculateBigramJaccard,
  calculateTitleSimilarity,
  calculateTopicTitleSimilarity,
} from "src/features/next-thread/domain/title-similarity";
import { describe, expect, it } from "vite-plus/test";

describe("title-similarity", () => {
  describe("calculateBigramJaccard", () => {
    it("同じタイトルは1、共通の2-gramがなければ0を返す", () => {
      expect(calculateBigramJaccard("架空PC総合", "架空PC総合")).toBe(1);
      expect(calculateBigramJaccard("架空PC総合", "あいうえお")).toBe(0);
    });

    it("共通する2-gramの割合（Jaccard係数）を返す", () => {
      // "ab" "bc" "cd" と "bc" "cd" "de" は共通2個、和集合4個。
      expect(calculateBigramJaccard("abcd", "bcde")).toBe(2 / 4);
    });

    it("1文字のタイトルでも同じ文字なら一致として扱う", () => {
      expect(calculateBigramJaccard("あ", "あ")).toBe(1);
      expect(calculateBigramJaccard("あ", "い")).toBe(0);
    });

    it("装飾を除いて空になるタイトルは0を返す", () => {
      expect(calculateBigramJaccard("", "架空PC総合")).toBe(0);
    });
  });

  describe("calculateTopicTitleSimilarity", () => {
    it("語句の順序が入れ替わったタイトルを、従来の類似度より近いと判定する", () => {
      const left = "架空CPU総合スレ 速度比較 発熱対策";
      const right = "発熱対策 速度比較 架空CPU総合スレ";

      expect(calculateTopicTitleSimilarity(left, right)).toBeGreaterThan(
        calculateTitleSimilarity(left, right),
      );
    });

    it("定型タグだけが共通する別話題は近いと判定しない", () => {
      expect(calculateTopicTitleSimilarity("【朗報】猫写真集", "【朗報】天気予報図")).toBe(0);
    });
  });
});
