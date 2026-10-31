import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { THREAD_AUTO_REFRESH_IDLE_STOP_COUNT } from "src/features/auto-refresh/browser/auto-refresh-config";
import {
  AutoRefreshHarness,
  createRect,
  setupAutoRefreshTest,
} from "src/test-support/auto-refresh-harness";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

describe("useAutoRefresh", () => {
  const autoRefreshMocks = setupAutoRefreshTest();

  it("開始前に判明したdat落ちを記録し、開始を繰り返しても取得しない", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpired = vi.fn();
    const onThreadExpiredDetected = vi.fn();
    const view = render(
      <AutoRefreshHarness
        enabled={false}
        expired
        onRequestRefresh={onRequestRefresh}
        onThreadExpired={onThreadExpired}
        onThreadExpiredDetected={onThreadExpiredDetected}
      />,
    );
    expect(onThreadExpiredDetected).toHaveBeenCalledOnce();
    expect(onThreadExpired).not.toHaveBeenCalled();

    for (let attempt = 0; attempt < 10; attempt++) {
      view.rerender(
        <AutoRefreshHarness
          enabled={attempt % 2 === 0}
          expired
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
          onThreadExpiredDetected={onThreadExpiredDetected}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }
    expect(onThreadExpiredDetected).toHaveBeenCalledOnce();
    expect(onThreadExpired).toHaveBeenCalledOnce();
    expect(onRequestRefresh).not.toHaveBeenCalled();
  });

  it("dat落ち検知で自動更新を止め、再描画やタブ切替では通知を重ねない", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpired = vi.fn();
    const { rerender } = render(
      <AutoRefreshHarness
        expired={false}
        onRequestRefresh={onRequestRefresh}
        onThreadExpired={onThreadExpired}
      />,
    );

    act(() => {
      rerender(
        <AutoRefreshHarness
          expired={true}
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
        />,
      );
    });

    expect(onThreadExpired).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      // 非アクティブ化・再アクティブ化と再取得による状態の揺れを再現する。
      rerender(
        <AutoRefreshHarness
          enabled={false}
          expired={true}
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
        />,
      );
      rerender(
        <AutoRefreshHarness
          enabled={true}
          expired={false}
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
        />,
      );
      rerender(
        <AutoRefreshHarness
          enabled={true}
          expired={true}
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
        />,
      );
    });

    expect(onThreadExpired).toHaveBeenCalledOnce();
  });

  it.each(["expired", "stopped"] as const)(
    "ライブチャットの非表示中に届いた新着は溜めずに表示し、復帰時の%sで停止する",
    (expirySource) => {
      const onRequestRefresh = vi.fn();
      const onThreadExpired = vi.fn();
      const onThreadExpiredDetected = vi.fn();
      const props = {
        liveChatMode: true,
        onRequestRefresh,
        onThreadExpired,
        onThreadExpiredDetected,
      };
      const view = render(<AutoRefreshHarness {...props} />);
      view.rerender(<AutoRefreshHarness {...props} enabled={false} active={false} />);
      fireEvent.click(screen.getByText("新着ありで完了"));
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      // 非表示の間は流す相手がいないため、新着を保留せずにすぐ表示する。
      expect(screen.getByTestId("live-chat-pending")).toHaveTextContent("0");

      view.rerender(<AutoRefreshHarness {...props} {...{ [expirySource]: true }} />);

      // 復帰時も溜まった新着を流し直さず、停止と停止理由の保存を完了する。
      expect(screen.getByTestId("live-chat-pending")).toHaveTextContent("0");
      expect(onThreadExpired).toHaveBeenCalledOnce();
      expect(onThreadExpiredDetected).toHaveBeenCalledOnce();
      expect(onRequestRefresh).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(onThreadExpired).toHaveBeenCalledOnce();
      expect(onRequestRefresh).not.toHaveBeenCalled();
    },
  );

  it("ライブチャットの1000レス到達は末尾を表示してから停止する", () => {
    const onThreadExpired = vi.fn();
    const props = { liveChatMode: true, onRequestRefresh: vi.fn(), onThreadExpired };
    const view = render(<AutoRefreshHarness {...props} />);
    fireEvent.click(screen.getByText("新着ありで完了"));
    view.rerender(<AutoRefreshHarness {...props} hasReachedThreadLimit />);
    expect(onThreadExpired).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByTestId("live-chat-pending")).toHaveTextContent("0");
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(onThreadExpired).toHaveBeenCalledOnce();
  });

  it("次スレ探索中はdat落ち停止を保留し、探索終了後に停止できる", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpired = vi.fn();
    const onThreadExpiredDetected = vi.fn();
    const { rerender } = render(
      <AutoRefreshHarness
        expired={false}
        deferExpiredStop
        onRequestRefresh={onRequestRefresh}
        onThreadExpired={onThreadExpired}
        onThreadExpiredDetected={onThreadExpiredDetected}
      />,
    );

    act(() => {
      rerender(
        <AutoRefreshHarness
          expired
          deferExpiredStop
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
          onThreadExpiredDetected={onThreadExpiredDetected}
        />,
      );
    });

    expect(onThreadExpired).not.toHaveBeenCalled();
    expect(onThreadExpiredDetected).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      rerender(
        <AutoRefreshHarness
          expired
          deferExpiredStop={false}
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
          onThreadExpiredDetected={onThreadExpiredDetected}
        />,
      );
    });

    expect(onThreadExpired).toHaveBeenCalledOnce();
    expect(onThreadExpiredDetected).toHaveBeenCalledOnce();
  });

  it("同一スレの後続不確定応答と予約済みtickでは再取得せず、別スレへ移ると再開する", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpiredDetected = vi.fn();
    const intervalCallbacks: Array<() => void> = [];
    const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation((callback) => {
      intervalCallbacks.push(callback as () => void);
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });
    const { rerender } = render(
      <AutoRefreshHarness
        scopeUrl="https://example.com/test/read.cgi/board/thread-a/"
        onRequestRefresh={onRequestRefresh}
        onThreadExpiredDetected={onThreadExpiredDetected}
      />,
    );
    const scheduledTick = intervalCallbacks.at(-1);
    expect(scheduledTick).toBeDefined();

    act(() => {
      rerender(
        <AutoRefreshHarness
          scopeUrl="https://example.com/test/read.cgi/board/thread-a/"
          expired
          onRequestRefresh={onRequestRefresh}
          onThreadExpiredDetected={onThreadExpiredDetected}
        />,
      );
    });
    expect(onThreadExpiredDetected).toHaveBeenCalledOnce();

    act(() => {
      // subject通信失敗後の本文取得成功を模し、生の失効情報だけがfalseへ戻る状態にする。
      rerender(
        <AutoRefreshHarness
          scopeUrl="https://example.com/test/read.cgi/board/thread-a/"
          stopped
          onRequestRefresh={onRequestRefresh}
          onThreadExpiredDetected={onThreadExpiredDetected}
        />,
      );
      scheduledTick?.();
      vi.advanceTimersByTime(3000);
    });
    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      // FOLLOW_NEXT_THREADは新URLをscopeにするため、旧スレの停止キーを引き継がない。
      rerender(
        <AutoRefreshHarness
          scopeUrl="https://example.com/test/read.cgi/board/thread-b/"
          onRequestRefresh={onRequestRefresh}
        />,
      );
    });
    act(() => {
      intervalCallbacks.at(-1)?.();
    });
    expect(onRequestRefresh).toHaveBeenCalledOnce();
    setIntervalSpy.mockRestore();
  });

  it("最初の通信失敗だけでは失効停止せず自動更新を続ける", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpiredDetected = vi.fn();
    const intervalCallbacks: Array<() => void> = [];
    const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation((callback) => {
      intervalCallbacks.push(callback as () => void);
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });

    render(
      <AutoRefreshHarness
        // subject取得の通信失敗はdat落ち確定ではないため、停止条件へ渡さない。
        expired={false}
        onRequestRefresh={onRequestRefresh}
        onThreadExpiredDetected={onThreadExpiredDetected}
      />,
    );

    act(() => {
      intervalCallbacks.at(-1)?.();
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();
    expect(onThreadExpiredDetected).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it("停止通知先が一時的に未設定でも、設定された後に失効停止を処理する", () => {
    const onRequestRefresh = vi.fn();
    const onThreadExpired = vi.fn();
    const { rerender } = render(
      <AutoRefreshHarness
        expired
        onRequestRefresh={onRequestRefresh}
        onThreadExpired={undefined}
      />,
    );

    expect(onThreadExpired).not.toHaveBeenCalled();
    act(() => {
      rerender(
        <AutoRefreshHarness
          expired
          onRequestRefresh={onRequestRefresh}
          onThreadExpired={onThreadExpired}
        />,
      );
    });

    expect(onThreadExpired).toHaveBeenCalledOnce();
  });

  it("新着が連続で来ない更新が一定回数に達したら自動停止する", () => {
    const onRequestRefresh = vi.fn();
    const onAutoStop = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} onAutoStop={onAutoStop} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    // 1 回ぶんの「新着なし更新」を完了させるヘルパ。
    const runIdleRefreshCycle = () => {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByText("新着なしで完了"));
      act(() => {
        vi.runOnlyPendingTimers();
      });
    };

    // 閾値の手前までは停止しない。
    for (let i = 0; i < THREAD_AUTO_REFRESH_IDLE_STOP_COUNT - 1; i += 1) {
      runIdleRefreshCycle();
    }
    expect(onAutoStop).not.toHaveBeenCalled();

    // 閾値ちょうどに達した回で停止する。
    runIdleRefreshCycle();
    expect(onAutoStop).toHaveBeenCalledOnce();
  });

  it("次スレ探索中は新着停止通知を保留する", () => {
    const onRequestRefresh = vi.fn();
    const onAutoStop = vi.fn();
    render(
      <AutoRefreshHarness
        deferAutoStop
        onRequestRefresh={onRequestRefresh}
        onAutoStop={onAutoStop}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    for (let i = 0; i < THREAD_AUTO_REFRESH_IDLE_STOP_COUNT; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByText("新着なしで完了"));
      act(() => {
        vi.runOnlyPendingTimers();
      });
    }

    expect(onAutoStop).not.toHaveBeenCalled();
  });

  // 累積や経過時間の判定そのものは auto-refresh-idle-stop.test.ts で純関数として検証する。
  // ここではフックへの配線（ON/OFFでの基準時刻の扱い、次スレ探索中の保留）だけを確認する。
  describe("時間ベースの自動停止", () => {
    const IDLE_STOP_TIMEOUT_MS = 9000;

    beforeEach(() => {
      vi.mocked(autoRefreshMocks.configGet).mockImplementation((key: string) => {
        if (key === "auto_load_idle_stop_timeout") return String(IDLE_STOP_TIMEOUT_MS);
        return "3000";
      });
    });

    // タイマー起点の更新を1回発火させ、指定のボタンで完了させる。
    const runTimerRefreshCycle = (completeButtonLabel: string) => {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByText(completeButtonLabel));
      act(() => {
        vi.advanceTimersByTime(0);
      });
    };

    it("ON後に一度も新着がなくても、指定時間が経てば自動停止する", () => {
      const onAutoStop = vi.fn();
      render(<AutoRefreshHarness onRequestRefresh={vi.fn()} onAutoStop={onAutoStop} />);

      // 以前は「最後の新着時刻」が未設定のままだと時間判定自体が行われず、
      // 新着の来ないスレへ通信し続けていた。
      for (let i = 0; i < 3; i += 1) {
        runTimerRefreshCycle("新着なしで完了");
      }
      expect(onAutoStop).not.toHaveBeenCalled();

      for (let i = 0; i < 3; i += 1) {
        runTimerRefreshCycle("新着なしで完了");
      }
      expect(onAutoStop).toHaveBeenCalledOnce();
    });

    it("OFFの間に経過した時間を、再ON後の停止判定へ持ち越さない", () => {
      const onAutoStop = vi.fn();
      const onRequestRefresh = vi.fn();
      const { rerender } = render(
        <AutoRefreshHarness onRequestRefresh={onRequestRefresh} onAutoStop={onAutoStop} />,
      );

      runTimerRefreshCycle("新着ありで完了");

      rerender(
        <AutoRefreshHarness
          enabled={false}
          onRequestRefresh={onRequestRefresh}
          onAutoStop={onAutoStop}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      rerender(
        <AutoRefreshHarness enabled onRequestRefresh={onRequestRefresh} onAutoStop={onAutoStop} />,
      );
      // ON 直後の即時更新を完了させる（放置判定の対象外）。
      fireEvent.click(screen.getByText("新着なしで完了"));
      act(() => {
        vi.advanceTimersByTime(0);
      });

      // 前回 ON 中の新着時刻から 60 秒以上経っていても、再 ON 直後の空振りでは止めない。
      runTimerRefreshCycle("新着なしで完了");
      expect(onAutoStop).not.toHaveBeenCalled();
    });
  });
});
