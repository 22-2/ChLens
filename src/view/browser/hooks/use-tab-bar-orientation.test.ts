import { act, renderHook } from "@testing-library/react";
import { container } from "src/service-container/index";
import {
  TAB_BAR_COLLAPSED_CONFIG_KEY,
  TAB_BAR_ORIENTATION_CONFIG_KEY,
  TAB_BAR_WIDTH_CONFIG_KEY,
  TAB_BAR_WIDTH_DEFAULT,
  clampTabBarWidth,
  useTabBarOrientation,
  useVerticalTabBarLayout,
} from "src/view/browser/hooks/use-tab-bar-orientation";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

describe("useTabBarOrientation", () => {
  let storedValues: Record<string, string | null>;
  let configUpdatedHandler: ((payload: { key?: string }) => void) | undefined;
  const configSetMock = vi.fn();

  beforeEach(() => {
    storedValues = {};
    configUpdatedHandler = undefined;
    configSetMock.mockReset();

    container.config = {
      get: vi.fn((key: string) => storedValues[`config_${key}`] ?? null),
      set: configSetMock,
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
    storedValues["config_tab_bar_orientation"] = "sideways";
    const { result } = renderHook(() => useTabBarOrientation());

    expect(result.current).toBe("horizontal");
  });

  it("設定変更通知を受けて垂直方向へ即時反映する", () => {
    const { result } = renderHook(() => useTabBarOrientation());

    storedValues["config_tab_bar_orientation"] = "vertical";
    act(() => configUpdatedHandler?.({ key: TAB_BAR_ORIENTATION_CONFIG_KEY }));

    expect(result.current).toBe("vertical");
  });
});

describe("clampTabBarWidth", () => {
  it("範囲内は整数へ丸める", () => {
    expect(clampTabBarWidth(208.6)).toBe(209);
  });

  it("範囲外は最小・最大へ丸める", () => {
    expect(clampTabBarWidth(100)).toBe(160);
    expect(clampTabBarWidth(400)).toBe(280);
  });

  it("数値以外は既定幅へ戻す", () => {
    expect(clampTabBarWidth(Number.NaN)).toBe(TAB_BAR_WIDTH_DEFAULT);
  });
});

describe("useVerticalTabBarLayout", () => {
  let storedValues: Record<string, string | null>;
  let configUpdatedHandlers: Array<(payload: { key?: string }) => void>;
  const configSetMock = vi.fn();

  const notifyConfigUpdated = (key: string) => {
    // 変更理由: 本物の message は複数購読できるため、登録された購読をすべて呼び出す。
    for (const handler of configUpdatedHandlers) {
      handler({ key });
    }
  };

  beforeEach(() => {
    storedValues = {};
    configUpdatedHandlers = [];
    configSetMock.mockReset();

    container.config = {
      get: vi.fn((key: string) => storedValues[`config_${key}`] ?? null),
      set: configSetMock,
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      send: vi.fn(),
      on: vi.fn((type: string, handler: (payload: { key?: string }) => void) => {
        if (type === "config_updated") {
          configUpdatedHandlers.push(handler);
        }
      }),
      off: vi.fn(),
    } as unknown as typeof container.message;
  });

  it("未設定時は展開表示と既定幅になる", () => {
    const { result } = renderHook(() => useVerticalTabBarLayout());

    expect(result.current.collapsed).toBe(false);
    expect(result.current.width).toBe(TAB_BAR_WIDTH_DEFAULT);
  });

  it("保存済みの簡易表示と幅を読み込む", () => {
    storedValues["config_tab_bar_collapsed"] = "on";
    storedValues["config_tab_bar_width"] = "250";
    const { result } = renderHook(() => useVerticalTabBarLayout());

    expect(result.current.collapsed).toBe(true);
    expect(result.current.width).toBe(250);
  });

  it("異常な幅は既定幅へ戻す", () => {
    storedValues["config_tab_bar_width"] = "not-a-number";
    const { result } = renderHook(() => useVerticalTabBarLayout());

    expect(result.current.width).toBe(TAB_BAR_WIDTH_DEFAULT);
  });

  it("簡易表示の切り替えを即時反映して保存する", () => {
    const { result } = renderHook(() => useVerticalTabBarLayout());

    act(() => result.current.setCollapsed(true));

    expect(result.current.collapsed).toBe(true);
    expect(configSetMock).toHaveBeenCalledWith(TAB_BAR_COLLAPSED_CONFIG_KEY, "on");
  });

  it("幅の確定値を範囲内へ丸めて保存する", () => {
    const { result } = renderHook(() => useVerticalTabBarLayout());

    act(() => result.current.setWidth(400));

    expect(result.current.width).toBe(280);
    expect(configSetMock).toHaveBeenCalledWith(TAB_BAR_WIDTH_CONFIG_KEY, "280");
  });

  it("他画面からの変更通知を受けて追従する", () => {
    const { result } = renderHook(() => useVerticalTabBarLayout());

    storedValues["config_tab_bar_collapsed"] = "on";
    act(() => notifyConfigUpdated(TAB_BAR_COLLAPSED_CONFIG_KEY));

    expect(result.current.collapsed).toBe(true);
  });
});
