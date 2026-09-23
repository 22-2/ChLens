import { describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  values: new Map<string, string>(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: (key: string) => state.values.get(key) ?? null,
      set: async (key: string, value: string) => {
        state.values.set(key, value);
      },
    },
  },
}));

vi.mock("src/view/browser/utils/link-routing", () => ({
  getBoardUrlFromThreadUrl: (url: string) => url,
}));

import {
  clearSiteScopedSettings,
  normalizeBoardKey,
  normalizeSiteKey,
  parseScopedSettings,
  persistScopedSetting,
  resolveScopedSetting,
  SCOPED_SETTINGS_CONFIG_KEY,
} from "./scoped-settings";

describe("サイト・板設定", () => {
  it("サイト設定より板設定を優先し、未設定の項目は全体へ戻す", () => {
    state.values.set("sage_flag", "on");
    state.values.set(
      SCOPED_SETTINGS_CONFIG_KEY,
      JSON.stringify({
        sites: {
          "example.com": {
            overrides: { sage_flag: "off" },
            boards: {
              "https://example.com/live/": { auto_load_second: "5000" },
            },
          },
        },
      }),
    );

    expect(resolveScopedSetting("sage_flag", "https://example.com/live/")).toEqual({
      value: "off",
      source: "site",
    });
    expect(resolveScopedSetting("auto_load_second", "https://example.com/live/")).toEqual({
      value: "5000",
      source: "board",
    });
    expect(resolveScopedSetting("auto_load_second_board", "https://example.com/live/")).toEqual({
      value: null,
      source: "global",
    });
  });

  it("URLの末尾スラッシュやホスト名の大文字を正規化する", () => {
    expect(normalizeSiteKey("HTTPS://Example.COM/path/")).toBe("example.com");
    expect(normalizeBoardKey("https://Example.COM/live?x=1#top")).toBe("https://example.com/live/");
  });

  it("板設定のHTTP/HTTPS表記と旧EddibB形式を同じキーへまとめる", () => {
    expect(normalizeBoardKey("http://bbs.eddibb.cc/test/read.cgi/liveedge/")).toBe(
      "https://bbs.eddibb.cc/liveedge/",
    );

    const document = parseScopedSettings(
      JSON.stringify({
        sites: {
          "bbs.eddibb.cc": {
            overrides: {},
            boards: {
              "http://bbs.eddibb.cc/test/read.cgi/liveedge/": { sage_flag: "off" },
              "https://bbs.eddibb.cc/liveedge/": { auto_load_second: "20000" },
            },
          },
        },
      }),
    );

    expect(document.sites["bbs.eddibb.cc"].boards).toEqual({
      "https://bbs.eddibb.cc/liveedge/": {
        sage_flag: "off",
        auto_load_second: "20000",
      },
    });
  });

  it("上書きを削除すると空のサイト情報も保存しない", async () => {
    state.values.set(SCOPED_SETTINGS_CONFIG_KEY, JSON.stringify({ sites: {} }));

    await persistScopedSetting({ site: "Example.com" }, "sage_flag", "off");
    expect(JSON.parse(state.values.get(SCOPED_SETTINGS_CONFIG_KEY) ?? "{}")).toEqual({
      sites: { "example.com": { overrides: { sage_flag: "off" }, boards: {} } },
    });

    await persistScopedSetting({ site: "example.com" }, "sage_flag", undefined);
    expect(state.values.get(SCOPED_SETTINGS_CONFIG_KEY)).toBe('{"sites":{}}');
  });

  it("サイト設定をまとめて削除しても別サイトと全体設定は残る", async () => {
    state.values.set("sage_flag", "on");
    state.values.set(
      SCOPED_SETTINGS_CONFIG_KEY,
      JSON.stringify({
        sites: {
          "example.com": {
            overrides: { sage_flag: "off" },
            boards: { "https://example.com/live/": { auto_load_second: "5000" } },
          },
          "example.net": { overrides: { sage_flag: "off" }, boards: {} },
        },
      }),
    );

    const pendingSave = persistScopedSetting(
      { site: "example.com", board: "https://example.com/live/" },
      "auto_load_second_board",
      "7000",
    );
    const pendingClear = clearSiteScopedSettings("Example.com");
    await Promise.all([pendingSave, pendingClear]);

    expect(JSON.parse(state.values.get(SCOPED_SETTINGS_CONFIG_KEY) ?? "{}")).toEqual({
      sites: { "example.net": { overrides: { sage_flag: "off" }, boards: {} } },
    });
    expect(state.values.get("sage_flag")).toBe("on");
  });
});
