import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { container } from "src/service-container/index";
import {
  AutoRefreshHarness,
  createRect,
  mockScrollBy,
  setupAutoRefreshTest,
} from "src/test-support/auto-refresh-harness";
import { describe, expect, it, vi } from "vite-plus/test";

describe("useAutoRefresh", () => {
  const autoRefreshMocks = setupAutoRefreshTest();

  it("自動更新を有効化した瞬間に最下部へ移動して即時 refresh する", () => {
    const onRequestRefresh = vi.fn();
    const { rerender } = render(
      <AutoRefreshHarness enabled={false} onRequestRefresh={onRequestRefresh} />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 12;
    const scrollHeightValue = 300;
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

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      rerender(<AutoRefreshHarness enabled={true} onRequestRefresh={onRequestRefresh} />);
    });

    expect(scrollTopValue).toBe(300);
    expect(onRequestRefresh).toHaveBeenCalledOnce();
  });

  it("有効なまま次スレを表示したときは再取得せず最下部から追従する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 12;
    const scrollHeightValue = 300;

    const { getByTestId } = render(
      <AutoRefreshHarness
        startAtBottom
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
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
        }}
      />,
    );

    const boundary = getByTestId("boundary") as HTMLDivElement;
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    expect(scrollTopValue).toBe(300);
    expect(getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      vi.runOnlyPendingTimers();
    });
  });

  it("次スレの初回取得完了後に一度だけ最下部へ同期する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 0;
    let scrollHeightValue = 80;
    const configureScrollContainer = (scrollContainer: HTMLDivElement) => {
      // 初回取得の描画も共通の底面補正を通るため、jsdomにないスクロール操作を再現する。
      mockScrollBy(scrollContainer, ({ top }: ScrollToOptions) => {
        scrollTopValue += top ?? 0;
      });
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
    };

    const { rerender, getByTestId } = render(
      <AutoRefreshHarness
        startAtBottom
        loading
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={configureScrollContainer}
      />,
    );

    expect(scrollTopValue).toBe(0);

    scrollHeightValue = 300;
    rerender(
      <AutoRefreshHarness
        startAtBottom
        loading={false}
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={configureScrollContainer}
      />,
    );

    expect(scrollTopValue).toBe(300);
    expect(getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    scrollTopValue = 12;
    // 実際の手動移動では操作イベントも届くため、次の描画より先に追従への割り込みを伝える。
    fireEvent.wheel(getByTestId("scroll-container"));
    scrollHeightValue = 400;
    rerender(
      <AutoRefreshHarness
        startAtBottom
        loading={false}
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={configureScrollContainer}
      />,
    );

    expect(scrollTopValue).toBe(12);
  });

  it("更新間隔が未設定でも既定の20秒で自動更新する", () => {
    autoRefreshMocks.config = {
      get: vi.fn((key: string) => {
        if (key === "auto_load_idle_stop_timeout") return "auto";
        return "0";
      }),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.config = autoRefreshMocks.config;

    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
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
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.advanceTimersByTime(19999);
    });

    expect(onRequestRefresh).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();
  });
});
