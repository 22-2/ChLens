import { act, renderHook } from "@testing-library/react";
import { container } from "src/service-container/index";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

describe("useConfigBooleanSetting", () => {
  let storedValues: Record<string, string | null>;
  let configUpdatedHandler: ((payload: { key?: string }) => void) | undefined;
  let setConfig: ReturnType<typeof vi.fn<(key: string, value: unknown) => void>>;

  beforeEach(() => {
    storedValues = {};
    configUpdatedHandler = undefined;
    setConfig = vi.fn<(key: string, value: unknown) => void>((key, value) => {
      storedValues[key] = String(value);
    });

    container.config = {
      get: vi.fn((key: string) => storedValues[key] ?? null),
      set: setConfig,
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      send: vi.fn(),
      on: vi.fn((type: string, handler: (payload: { key?: string }) => void) => {
        if (type === "config_updated") {
          configUpdatedHandler = handler;
        }
      }),
      off: vi.fn(),
    } as unknown as typeof container.message;
  });

  it("未設定時は指定した既定値を返す", () => {
    const { result } = renderHook(() => useConfigBooleanSetting("example", true));

    expect(result.current.value).toBe(true);
  });

  it("設定変更通知を受けて値を反映する", () => {
    const { result } = renderHook(() => useConfigBooleanSetting("example"));

    storedValues.example = "on";
    act(() => configUpdatedHandler?.({ key: "example" }));

    expect(result.current.value).toBe(true);
  });

  it("変更値を即時反映して設定へ保存する", () => {
    const { result } = renderHook(() => useConfigBooleanSetting("example"));

    act(() => result.current.setValue(true));

    expect(result.current.value).toBe(true);
    expect(setConfig).toHaveBeenCalledWith("example", "on");
  });
});
