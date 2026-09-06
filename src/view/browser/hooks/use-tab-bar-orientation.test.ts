import { act, renderHook } from "@testing-library/react";
import { container } from "src/service-container/index";
import {
  TAB_BAR_ORIENTATION_CONFIG_KEY,
  useTabBarOrientation,
} from "src/view/browser/hooks/use-tab-bar-orientation";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

describe("useTabBarOrientation", () => {
  let storedValue: string | null;
  let configUpdatedHandler: ((payload: { key?: string }) => void) | undefined;

  beforeEach(() => {
    storedValue = null;
    configUpdatedHandler = undefined;

    container.config = {
      get: vi.fn(() => storedValue),
      set: vi.fn(),
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

  it("未設定時は既存の水平タブバーを維持する", () => {
    const { result } = renderHook(() => useTabBarOrientation());

    expect(result.current).toBe("horizontal");
  });

  it("未知値は水平として扱う", () => {
    storedValue = "sideways";
    const { result } = renderHook(() => useTabBarOrientation());

    expect(result.current).toBe("horizontal");
  });

  it("設定変更通知を受けて垂直方向へ即時反映する", () => {
    const { result } = renderHook(() => useTabBarOrientation());

    storedValue = "vertical";
    act(() => configUpdatedHandler?.({ key: TAB_BAR_ORIENTATION_CONFIG_KEY }));

    expect(result.current).toBe("vertical");
  });
});
