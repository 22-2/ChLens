import { act, cleanup, render } from "@testing-library/react";
import { useAutoRefreshTimer } from "src/features/auto-refresh/browser/use-auto-refresh-timer";
import { container } from "src/service-container/index";
import type { IConfig, IMessage } from "src/service-container/interfaces";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function TimerProbe({
  active = true,
  onTick,
  onInterval,
}: {
  active?: boolean;
  onTick: () => void;
  onInterval?: (intervalMs: number) => void;
}) {
  const intervalMs = useAutoRefreshTimer({
    scopeUrl: "https://example.com/test/read.cgi/board/1/",
    active,
    onTick,
  });
  onInterval?.(intervalMs);
  return null;
}

describe("useAutoRefreshTimer", () => {
  let intervalSetting: string;
  let configUpdatedHandler: ((message: { key?: string }) => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    intervalSetting = "3000";
    configUpdatedHandler = undefined;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    const config: IConfig = {
      get: vi.fn(() => intervalSetting),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    const message: IMessage = {
      send: vi.fn(),
      on: vi.fn((_type: string, handler: (message: { key?: string }) => void) => {
        configUpdatedHandler = handler;
      }) as IMessage["on"],
      off: vi.fn(),
    };
    container.config = config;
    container.message = message;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("設定された間隔ごとに onTick を呼ぶ", () => {
    const onTick = vi.fn();
    render(<TimerProbe onTick={onTick} />);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onTick).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onTick).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it("無効な間は onTick を呼ばない", () => {
    const onTick = vi.fn();
    render(<TimerProbe active={false} onTick={onTick} />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onTick).not.toHaveBeenCalled();
  });

  it("タブが非表示の間は止め、表示に戻ると再開する", () => {
    const onTick = vi.fn();
    render(<TimerProbe onTick={onTick} />);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onTick).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onTick).toHaveBeenCalledOnce();
  });

  it("実行時の下限より短い間隔では onTick を呼ばない", () => {
    intervalSetting = "1000";
    const onTick = vi.fn();
    render(<TimerProbe onTick={onTick} />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onTick).not.toHaveBeenCalled();
  });

  it("onTick が変わるとタイマーを作り直し、そこから間隔を数え直す", () => {
    const firstTick = vi.fn();
    const secondTick = vi.fn();
    const { rerender } = render(<TimerProbe onTick={firstTick} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    rerender(<TimerProbe onTick={secondTick} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // 元のタイマーなら 3 秒時点で発火していたが、作り直したので 5 秒時点まで待つ。
    expect(firstTick).not.toHaveBeenCalled();
    expect(secondTick).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(secondTick).toHaveBeenCalledOnce();
  });

  it("設定変更の通知で間隔を読み直す", () => {
    const onTick = vi.fn();
    const onInterval = vi.fn();
    render(<TimerProbe onTick={onTick} onInterval={onInterval} />);
    expect(onInterval).toHaveBeenLastCalledWith(3000);

    intervalSetting = "10000";
    act(() => {
      configUpdatedHandler?.({ key: "auto_load_second" });
    });
    expect(onInterval).toHaveBeenLastCalledWith(10000);

    act(() => {
      vi.advanceTimersByTime(9999);
    });
    expect(onTick).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onTick).toHaveBeenCalledOnce();
  });

  it("関係のない設定の変更では間隔を読み直さない", () => {
    const onInterval = vi.fn();
    render(<TimerProbe onTick={vi.fn()} onInterval={onInterval} />);
    const renders = onInterval.mock.calls.length;

    intervalSetting = "10000";
    act(() => {
      configUpdatedHandler?.({ key: "unrelated_key" });
    });
    expect(onInterval).toHaveBeenCalledTimes(renders);
  });
});
