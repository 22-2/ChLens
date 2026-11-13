import { act, cleanup, renderHook } from "@testing-library/react";
import { useThreadToolbarPosition } from "src/features/thread/browser/use-thread-toolbar-position";
import { container } from "src/service-container/index";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

describe("スレッド操作バーの位置", () => {
  let saved: string | null;
  let setConfig: ReturnType<typeof vi.fn<(key: string, value: unknown) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    saved = null;
    setConfig = vi.fn<(key: string, value: unknown) => void>((_key, value) => {
      saved = String(value);
    });
    container.config = {
      get: () => saved,
      set: setConfig,
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn(),
    } as unknown as typeof container.message;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("初期位置は下寄りで、ドラッグ完了時だけ保存して次に開いたとき復元する", () => {
    const first = renderHook(() => useThreadToolbarPosition());
    expect(first.result.current.position).toBe(0.8);
    act(() => {
      first.result.current.move(0.4);
      first.result.current.move(0.3);
    });
    expect(first.result.current.position).toBe(0.3);
    expect(setConfig).not.toHaveBeenCalled();
    act(() => first.result.current.commit());
    expect(setConfig).toHaveBeenCalledExactlyOnceWith("thread_toolbar_position", "0.3");
    first.unmount();
    const second = renderHook(() => useThreadToolbarPosition());
    expect(second.result.current.position).toBe(0.3);
  });

  it("キー操作は連続入力をまとめ、画面を閉じる時には残りを保存する", () => {
    const { result, unmount } = renderHook(() => useThreadToolbarPosition());
    act(() => {
      result.current.move(0.7, true);
      vi.advanceTimersByTime(200);
      result.current.move(0.6, true);
    });
    expect(setConfig).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(setConfig).toHaveBeenCalledExactlyOnceWith("thread_toolbar_position", "0.6");
    act(() => result.current.move(0.4, true));
    unmount();
    expect(setConfig).toHaveBeenLastCalledWith("thread_toolbar_position", "0.4");
    expect(setConfig).toHaveBeenCalledTimes(2);
  });

  it("保存値はペイン内の範囲に収める", () => {
    saved = "2";
    const { result } = renderHook(() => useThreadToolbarPosition());
    expect(result.current.position).toBe(1);
    act(() => result.current.move(-1));
    expect(result.current.position).toBe(0);
  });
});
