import { afterEach, describe, expect, it, vi } from "vite-plus/test";

// 変更理由: 版やハッシュの値は git の状態に依らせず、整形の結果を固定値で確かめる。
const { buildInfo, isTauriRuntimeMock } = vi.hoisted(() => ({
  buildInfo: {
    version: "1.2.3",
    buildTime: "2026-10-31T03:04:05.000Z",
    gitHash: "abc1234",
    author: "テスト作者",
    license: "MIT",
    repositoryUrl: "https://example.com/test-owner/chlens",
  },
  isTauriRuntimeMock: vi.fn<() => boolean>(),
}));

vi.mock("src/app/build-info", () => ({ CHLENS_BUILD_INFO: buildInfo }));
vi.mock("src/app/platform/runtime", () => ({ isTauriRuntime: isTauriRuntimeMock }));

import { collectEnvironmentInfo, formatEnvironmentInfo } from "src/app/debug/environment-info";

describe("実行環境の情報", () => {
  afterEach(() => {
    isTauriRuntimeMock.mockReset();
  });

  it("版・ビルド時刻・ハッシュ・言語・ユーザーエージェントを集める", () => {
    isTauriRuntimeMock.mockReturnValue(false);

    const info = collectEnvironmentInfo();

    expect(info.version).toBe("1.2.3");
    expect(info.buildTime).toBe(buildInfo.buildTime);
    expect(info.gitHash).toBe("abc1234");
    expect(info.language).toBe(navigator.language);
    expect(info.userAgent).toBe(navigator.userAgent);
  });

  it("Tauriで動いているときは、実行環境を tauri にする", () => {
    isTauriRuntimeMock.mockReturnValue(true);

    expect(collectEnvironmentInfo().runtime).toBe("tauri");
  });

  it("Tauri以外では、画面のURLのスキームを実行環境にする", () => {
    isTauriRuntimeMock.mockReturnValue(false);

    expect(collectEnvironmentInfo().runtime).toBe(window.location.protocol.replace(/:$/, ""));
  });

  it("項目名つきの1ブロックにし、時刻は日本時間で書く", () => {
    const text = formatEnvironmentInfo(
      {
        version: "1.2.3",
        buildTime: buildInfo.buildTime,
        gitHash: "abc1234",
        runtime: "chrome-extension",
        language: "ja",
        userAgent: "UA-test",
      },
      Date.UTC(2026, 9, 31, 0, 0, 0),
    );

    expect(text).toBe(
      [
        "--- ChLens 環境情報 ---",
        "出力時刻: 2026-10-31T09:00:00.000+09:00",
        "バージョン: 1.2.3",
        "ビルド時刻: 2026-10-31T12:04:05.000+09:00",
        "Gitハッシュ: abc1234",
        "実行環境: chrome-extension",
        "言語: ja",
        "ユーザーエージェント: UA-test",
        "---",
      ].join("\n"),
    );
  });
});
