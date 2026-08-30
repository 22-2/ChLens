import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_COMMENT_OVERLAY_SETTINGS } from "../domain";

const configMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: configMock,
  },
}));

import { readCommentOverlaySettings } from "./settings";

describe("ConfigからのコメントOverlay設定読み出し", () => {
  beforeEach(() => {
    configMock.get.mockReset();
  });

  it("文字列の保存値をOverlay設定へ変換する", () => {
    configMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        comment_overlay_speed: "180",
        comment_overlay_font_size: "24",
        comment_overlay_opacity: "0.6",
        comment_overlay_max_queue: "120",
      };
      return values[key] ?? null;
    });

    expect(readCommentOverlaySettings()).toEqual({
      baseSpeedPxPerSecond: 180,
      fontSize: 24,
      opacity: 0.6,
      maxQueueSize: 120,
    });
  });

  it("範囲外や数値でない保存値をdomainの範囲へ揃える", () => {
    configMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        comment_overlay_speed: "999",
        comment_overlay_font_size: "文字サイズ",
        comment_overlay_opacity: "-1",
        comment_overlay_max_queue: "12.6",
      };
      return values[key] ?? null;
    });

    expect(readCommentOverlaySettings()).toEqual({
      baseSpeedPxPerSecond: 600,
      fontSize: DEFAULT_COMMENT_OVERLAY_SETTINGS.fontSize,
      opacity: 0.1,
      maxQueueSize: 13,
    });
  });

  it("Config読み出し自体が失敗した場合は既定値を返す", () => {
    const error = new Error("Config unavailable");
    configMock.get.mockImplementation(() => {
      throw error;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(readCommentOverlaySettings()).toEqual(DEFAULT_COMMENT_OVERLAY_SETTINGS);
    expect(consoleError).toHaveBeenCalledWith(
      "[ChLens] コメントOverlay設定の読み込みに失敗しました:",
      error,
    );

    consoleError.mockRestore();
  });
});
