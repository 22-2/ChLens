import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: () => null,
    },
  },
}));

vi.mock("src/view/browser/components/NGEditor", () => ({
  NGEditor: () => null,
}));

import { getSettingsSections } from "./settings-sections";

describe("設定セクションの実行環境フィルター", () => {
  it("Browser版ではTauri専用のOverlay設定を表示しない", () => {
    const sections = getSettingsSections(false);

    expect(sections.some((section) => section.id === "overlay")).toBe(false);
  });

  it("Tauri版ではOverlay設定と4項目を表示する", () => {
    const sections = getSettingsSections(true);
    const overlay = sections.find((section) => section.id === "overlay");

    expect(overlay).toBeDefined();
    expect(overlay?.fields.map((field) => ("key" in field ? field.key : field.id))).toEqual([
      "display",
      "comment_overlay_speed",
      "comment_overlay_font_size",
      "comment_overlay_opacity",
      "comment_overlay_max_queue",
    ]);
  });
});
