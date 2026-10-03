import { act, cleanup, renderHook } from "@testing-library/react";
import { useAutoNextThreadSetting } from "src/view/browser/hooks/use-auto-next-thread-setting";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { readConfigValue, persistConfigValue } = vi.hoisted(() => ({
  readConfigValue: vi.fn(),
  persistConfigValue: vi.fn(),
}));

vi.mock("src/view/browser/utils/config-setting", () => ({
  readConfigValue,
  persistConfigValue,
  subscribeConfigKeys: () => () => undefined,
}));
vi.mock("src/view/browser/hooks/use-config-boolean-setting", () => ({
  useConfigBooleanSetting: () => ({ value: true, setValue: vi.fn() }),
}));

describe("自動スレ移動の設定互換", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  // 既存の保存値を消さずに読み替え、廃止したモードが実行側へ渡らないことを保証する。
  it.each([
    { stored: "cautious", expected: "balanced" },
    { stored: "balanced", expected: "balanced" },
    { stored: "aggressive", expected: "aggressive" },
    { stored: "unknown", expected: "balanced" },
    { stored: null, expected: "balanced" },
  ])("保存値$storedを$expectedとして読み込む", ({ stored, expected }) => {
    readConfigValue.mockImplementation((key: string) =>
      key === "auto_next_thread_mode" ? stored : null,
    );
    const { result } = renderHook(useAutoNextThreadSetting);
    expect(result.current.mode).toBe(expected);
  });

  it("旧設定を読み替えたあと積極モードへの変更を保存する", () => {
    readConfigValue.mockImplementation((key: string) =>
      key === "auto_next_thread_mode" ? "cautious" : null,
    );
    const { result } = renderHook(useAutoNextThreadSetting);
    act(() => result.current.setMode("aggressive"));
    expect(result.current.mode).toBe("aggressive");
    expect(persistConfigValue).toHaveBeenCalledWith(
      "auto_next_thread_mode",
      "aggressive",
      "AutoNextThreadSetting",
    );
  });
});
