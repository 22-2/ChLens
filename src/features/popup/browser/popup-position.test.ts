// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { resolvePopupPosition, triggerFromPoint } from "./popup-position";

describe("ポップアップの配置", () => {
  const viewport = { right: 1200, bottom: 800 };

  it("親がない場合は操作位置の下に配置する", () => {
    expect(resolvePopupPosition({ trigger: triggerFromPoint(200, 300), viewport })).toEqual({
      x: 200,
      y: 312,
    });
  });

  it("子は操作位置にかかわらず親の左上から右上に40pxずらす", () => {
    expect(
      resolvePopupPosition({
        trigger: triggerFromPoint(400, 600),
        parentRect: { left: 200, top: 300 },
        viewport,
      }),
    ).toEqual({ x: 240, y: 260 });
  });

  it("親が画面上端に近い場合は余白を確保する", () => {
    expect(
      resolvePopupPosition({
        trigger: triggerFromPoint(400, 600),
        parentRect: { left: 200, top: 30 },
        viewport,
      }),
    ).toEqual({ x: 240, y: 16 });
  });

  it("画面右下では最大幅と余白を考慮して表示範囲内に収める", () => {
    expect(resolvePopupPosition({ trigger: triggerFromPoint(1199, 799), viewport })).toEqual({
      x: 624,
      y: 784,
    });
  });

  it("画面が狭い場合も左上の余白より外へ出さない", () => {
    expect(
      resolvePopupPosition({
        trigger: triggerFromPoint(-10, -10),
        viewport: { right: 300, bottom: 200 },
      }),
    ).toEqual({ x: 16, y: 16 });
  });
});
