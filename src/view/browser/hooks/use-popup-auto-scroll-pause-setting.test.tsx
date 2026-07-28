import { act, renderHook } from "@testing-library/react";
import { container } from "src/service-container/index";
import {
  POPUP_AUTO_SCROLL_PAUSE_CONFIG_KEY,
  usePopupAutoScrollPauseSetting,
} from "src/view/browser/hooks/use-popup-auto-scroll-pause-setting";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

describe("usePopupAutoScrollPauseSetting", () => {
  let storedValue: string | null;
  let setConfig: ReturnType<typeof vi.fn<(key: string, value: unknown) => void>>;

  beforeEach(() => {
    storedValue = null;
    setConfig = vi.fn<(key: string, value: unknown) => void>((key, value) => {
      if (key === POPUP_AUTO_SCROLL_PAUSE_CONFIG_KEY) {
        storedValue = String(value);
      }
    });

    container.config = {
      get: vi.fn(() => storedValue),
      set: setConfig,
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn() as typeof container.message.on,
      off: vi.fn(),
      send: vi.fn(),
    };
  });

  it("未設定時は既存動作を維持するため有効になる", () => {
    const { result } = renderHook(() => usePopupAutoScrollPauseSetting());

    expect(result.current.enabled).toBe(true);
  });

  it("切り替えを即時反映して設定へ保存する", () => {
    const { result } = renderHook(() => usePopupAutoScrollPauseSetting());

    act(() => result.current.setEnabled(false));

    expect(result.current.enabled).toBe(false);
    expect(setConfig).toHaveBeenCalledWith(POPUP_AUTO_SCROLL_PAUSE_CONFIG_KEY, "off");
  });
});
