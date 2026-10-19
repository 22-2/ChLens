import {
  DEFAULT_RES_HEIGHT_METRICS,
  estimateResHeight,
  type ResHeightMetrics,
} from "src/features/thread/domain/res-height-estimate";
import { describe, expect, it } from "vite-plus/test";

const metrics: ResHeightMetrics = {
  ...DEFAULT_RES_HEIGHT_METRICS,
  lineHeight: 20,
  fontSize: 10,
  contentWidth: 100,
  chromeHeight: 30,
  mediaRowHeight: 50,
  mediaColumns: 3,
};

describe("レスの高さの見積もり", () => {
  it("1行の本文はヘッダと余白に1行分を足した高さになる", () => {
    expect(estimateResHeight({ message: "短いレス" }, metrics)).toBe(30 + 20);
  });

  it("改行ごとに1行を数え、空行も1行として扱う", () => {
    expect(estimateResHeight({ message: "一行目<br>二行目<BR/><br>四行目" }, metrics)).toBe(
      30 + 4 * 20,
    );
  });

  it("幅を超える行は折り返す行数を数え、半角は全角より狭くみなす", () => {
    // 全角25文字は幅250で、幅100に3行で収まる。
    expect(estimateResHeight({ message: "あ".repeat(25) }, metrics)).toBe(30 + 3 * 20);
    // 半角25文字は幅137.5で、2行になる。
    expect(estimateResHeight({ message: "a".repeat(25) }, metrics)).toBe(30 + 2 * 20);
  });

  it("タグは幅に数えず、文字参照は1文字として数える", () => {
    const message = '<a class="anchor">&gt;&gt;12</a>';
    expect(estimateResHeight({ message }, metrics)).toBe(30 + 20);
  });

  it("画像URLはサムネイルの行として、列数ごとに1行を足す", () => {
    const urls = [1, 2, 3, 4].map((n) => `https://example.com/${n}.png`).join("<br>");
    // URLの行は折り返さない幅にして、サムネイルの行だけを確かめる。
    const wide = { ...metrics, contentWidth: 1000 };
    expect(estimateResHeight({ message: urls }, wide)).toBe(30 + 4 * 20 + 2 * 50);
  });
});
