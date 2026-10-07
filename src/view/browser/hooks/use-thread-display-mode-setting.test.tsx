import "@testing-library/jest-dom/vitest";

import { act, cleanup, renderHook } from "@testing-library/react";
import { container } from "src/service-container/index";
import {
  THREAD_DISPLAY_MODE_CONFIG_KEY,
  useThreadDisplayModeSetting,
} from "src/view/browser/hooks/use-thread-display-mode-setting";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

describe("useThreadDisplayModeSetting", () => {
  let stored: Record<string, string>;
  let configUpdated: ((message?: { key?: string }) => void) | null;

  beforeEach(() => {
    stored = {};
    configUpdated = null;
    container.config = {
      get: vi.fn((key: string) => stored[key] ?? null),
      set: vi.fn((key: string, value: unknown) => {
        stored[key] = String(value);
      }),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn(<T,>(_type: string, listener: (data: T) => void) => {
        configUpdated = listener as (message?: { key?: string }) => void;
      }),
      off: vi.fn(),
      send: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("未保存時は通常表示を返す", () => {
    const { result } = renderHook(() => useThreadDisplayModeSetting());
    expect(result.current.mode).toBe("normal");
  });

  it("保存済みのライブチャット風表示を新しく描画した画面でも復元する", () => {
    stored[THREAD_DISPLAY_MODE_CONFIG_KEY] = "live-chat";
    const { result } = renderHook(() => useThreadDisplayModeSetting());
    expect(result.current.mode).toBe("live-chat");
  });

  it("変更を設定へ保存し、別の利用箇所にも通知経由で反映する", () => {
    const first = renderHook(() => useThreadDisplayModeSetting());
    const second = renderHook(() => useThreadDisplayModeSetting());

    act(() => first.result.current.setMode("live-chat"));
    expect(stored[THREAD_DISPLAY_MODE_CONFIG_KEY]).toBe("live-chat");

    act(() => configUpdated?.({ key: THREAD_DISPLAY_MODE_CONFIG_KEY }));
    expect(second.result.current.mode).toBe("live-chat");
  });

  it("未知の保存値は通常表示として扱う", () => {
    stored[THREAD_DISPLAY_MODE_CONFIG_KEY] = "unknown";
    const { result } = renderHook(() => useThreadDisplayModeSetting());
    expect(result.current.mode).toBe("normal");
  });
});
