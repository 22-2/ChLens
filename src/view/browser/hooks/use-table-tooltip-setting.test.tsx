import { act, renderHook } from "@testing-library/react";
import { container } from "src/service-container/index";
import {
  TABLE_TOOLTIP_CONFIG_KEY,
  useTableTooltipEnabled,
} from "src/view/browser/hooks/use-table-tooltip-setting";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

describe("useTableTooltipEnabled", () => {
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

  it("未設定時は既存のツールチップ表示を維持する", () => {
    const { result } = renderHook(() => useTableTooltipEnabled());

    expect(result.current).toBe(true);
  });

  it("設定変更通知を受けて表示状態を即時反映する", () => {
    const { result } = renderHook(() => useTableTooltipEnabled());

    storedValue = "off";
    act(() => configUpdatedHandler?.({ key: TABLE_TOOLTIP_CONFIG_KEY }));

    expect(result.current).toBe(false);
  });
});
