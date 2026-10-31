import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  AutoRefreshHarness,
  createRect,
  setupAutoRefreshTest,
} from "src/test-support/auto-refresh-harness";
import { describe, expect, it, vi } from "vite-plus/test";

describe("useAutoRefresh", () => {
  setupAutoRefreshTest();

  it("取得中にポップアップを開閉しても二重取得せず、OFFの後は再開しない", () => {
    const onRequestRefresh = vi.fn();
    const { rerender } = render(
      <AutoRefreshHarness enabled={false} onRequestRefresh={onRequestRefresh} />,
    );
    rerender(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);
    expect(onRequestRefresh).toHaveBeenCalledTimes(1);
    rerender(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        loading
        pauseRefresh
        pauseAutoScroll
      />,
    );
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    rerender(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} loading />);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(onRequestRefresh).toHaveBeenCalledTimes(1);
    rerender(<AutoRefreshHarness enabled={false} onRequestRefresh={onRequestRefresh} />);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(onRequestRefresh).toHaveBeenCalledTimes(1);
  });

  it("ポップアップ表示中は自動更新を継続しつつ自動スクロールだけ停止する", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} pauseAutoScroll={true} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn();
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
      vi.advanceTimersByTime(3000);
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("idle");
  });

  it.each([false, true])(
    "ポップアップの一時停止と再開を連続しても取得を増やさず通信中は重複させない（ライブ=%s）",
    (liveChatMode) => {
      const onRequestRefresh = vi.fn();
      const view = render(
        <AutoRefreshHarness liveChatMode={liveChatMode} onRequestRefresh={onRequestRefresh} />,
      );
      const scrollContainer = screen.getByTestId("scroll-container");
      scrollContainer.scrollBy = vi.fn();

      const togglePopupRepeatedly = () => {
        // 各変更を別の描画として確定し、Reactの一括更新で連続操作が省略されないようにする。
        for (let attempt = 0; attempt < 20; attempt++) {
          view.rerender(
            <AutoRefreshHarness
              liveChatMode={liveChatMode}
              onRequestRefresh={onRequestRefresh}
              pauseAutoScroll={attempt % 2 === 0}
            />,
          );
          act(() => {
            vi.advanceTimersByTime(50);
          });
        }
      };

      togglePopupRepeatedly();
      togglePopupRepeatedly();
      expect(onRequestRefresh).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(onRequestRefresh).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onRequestRefresh).toHaveBeenCalledOnce();

      // 取得が長引いても、一時停止の切替や次の周期でリクエストを重ねない。
      togglePopupRepeatedly();
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(onRequestRefresh).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByText("新着なしで完了"));
      togglePopupRepeatedly();
      expect(onRequestRefresh).toHaveBeenCalledOnce();
      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(onRequestRefresh).toHaveBeenCalledOnce();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onRequestRefresh).toHaveBeenCalledTimes(2);
    },
  );
});
