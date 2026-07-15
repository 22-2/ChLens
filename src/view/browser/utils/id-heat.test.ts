import {
  getIdHeatColor,
  ID_HEAT_COOL_PEAK_COUNT,
  ID_HEAT_HOT_MAX_COUNT,
} from "src/view/browser/utils/id-heat";
import { describe, expect, it } from "vite-plus/test";

describe("getIdHeatColor", () => {
  it("1件以下は灰色を返す", () => {
    expect(getIdHeatColor(0)).toBe("var(--browser-color-res-id-muted)");
    expect(getIdHeatColor(1)).toBe("var(--browser-color-res-id-muted)");
  });

  it("中間件数では灰色から青へ補間する", () => {
    const color = getIdHeatColor(3);
    expect(color).toContain("var(--browser-color-res-id-muted)");
    expect(color).toContain("var(--browser-color-res-id-cool)");
  });

  it("高件数では青から赤へ補間し、上限以降は赤寄りで飽和する", () => {
    const coolToHot = getIdHeatColor(ID_HEAT_COOL_PEAK_COUNT + 1);
    const saturated = getIdHeatColor(ID_HEAT_HOT_MAX_COUNT + 20);
    expect(coolToHot).toContain("var(--browser-color-res-id-cool)");
    expect(coolToHot).toContain("var(--browser-color-res-heat-hot)");
    expect(saturated).toContain("var(--browser-color-res-id-cool) 0%");
    expect(saturated).toContain("var(--browser-color-res-heat-hot) 100%");
  });
});
