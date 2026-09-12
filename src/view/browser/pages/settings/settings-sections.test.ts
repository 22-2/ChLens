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

import { getSettingsSections, readAllSettings } from "./settings-sections";

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
      "comment_overlay_opacity",
      "comment_overlay_max_queue",
      "comment_overlay_fetch_all_threads",
    ]);
  });

  it("NG表示方式に3つの選択肢を用意し、旧既定値をhard-ngへ読み替える", () => {
    const ng = getSettingsSections(false).find((section) => section.id === "ng");
    const displayField = ng?.fields.find((field) => "key" in field && field.key === "display_ng");

    expect(displayField).toMatchObject({
      kind: "string",
      widget: "radio",
      options: [{ const: "hard-ng" }, { const: "soft-ng" }, { const: "highlight-ng" }],
    });
    expect(readAllSettings().ng.display_ng).toBe("hard-ng");
  });

  it("書き込み操作の設定を一般セクションへまとめる", () => {
    const general = getSettingsSections(false).find((section) => section.id === "general");
    const keys = general?.fields.map((field) => ("key" in field ? field.key : field.id));

    expect(keys).toContain("write_submit_ctrl_enter");
    expect(keys).toContain("sage_flag");
    expect(keys).toContain("write_close_panel_after_submit");
  });
});
