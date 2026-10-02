import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { WheelScrollIndicator } from "src/view/browser/components/WheelScrollIndicator";
import { useWheelPagination, WHEEL_THRESHOLD } from "src/view/browser/hooks/useWheelPagination";
import {
  getManualRefreshCooldownRemainingMs,
  MANUAL_REFRESH_COOLDOWN_MS,
  runManualRefresh,
} from "src/view/browser/utils/manual-refresh";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

interface WheelProbeProps {
  edge: "top" | "bottom";
  id: string;
  isLoading?: boolean;
  cooldownScopeKey?: string;
  onRefresh: () => boolean | void;
}

function WheelProbe({
  edge,
  id,
  isLoading = false,
  cooldownScopeKey = "tab-1\u0000thread:https://example.com/thread/1",
  onRefresh,
}: WheelProbeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wheelPagination = useWheelPagination({
    isEnabled: true,
    isLoading,
    cooldownScopeKey,
    containerRef,
    edge,
    onRefresh,
  });

  return (
    <div data-testid={id} data-cooling={wheelPagination.isCoolingDown} ref={containerRef}>
      <WheelScrollIndicator {...wheelPagination} threshold={WHEEL_THRESHOLD} />
    </div>
  );
}

function setScrollableMetrics(element: HTMLElement): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 100 },
    scrollTop: { configurable: true, value: 0 },
  });
}

function scrollToRefresh(element: HTMLElement, deltaY: number): void {
  for (let index = 0; index < WHEEL_THRESHOLD; index += 1) {
    fireEvent.wheel(element, { deltaY });
  }
}

describe("useWheelPagination", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("同じスレッドの更新待ちを共有し、ロードが始まるまではスピナーを出さない", async () => {
    const listRefresh = vi.fn();
    const threadRefresh = vi.fn();
    const scope = "tab-1\u0000thread:https://example.com/thread/1";
    render(
      <>
        <WheelProbe
          id="list"
          edge="top"
          cooldownScopeKey={scope}
          onRefresh={() => runManualRefresh(scope, listRefresh)}
        />
        <WheelProbe
          id="thread"
          edge="bottom"
          cooldownScopeKey={scope}
          onRefresh={() => runManualRefresh(scope, threadRefresh)}
        />
      </>,
    );
    const list = screen.getByTestId("list");
    const thread = screen.getByTestId("thread");
    setScrollableMetrics(list);
    setScrollableMetrics(thread);

    scrollToRefresh(list, -1);
    expect(listRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByLabelText("ホイール更新中")).toHaveLength(0);
    expect(list).toHaveAttribute("data-cooling", "true");
    expect(thread).toHaveAttribute("data-cooling", "true");

    scrollToRefresh(thread, 1);
    expect(threadRefresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(MANUAL_REFRESH_COOLDOWN_MS);
    expect(screen.queryAllByLabelText("ホイール更新中")).toHaveLength(0);
    expect(list).toHaveAttribute("data-cooling", "false");
    expect(thread).toHaveAttribute("data-cooling", "false");

    scrollToRefresh(thread, 1);
    expect(threadRefresh).toHaveBeenCalledTimes(1);
  });

  it("ボタン更新後はwheel受付を拒否し期限を延長しない", async () => {
    const scope = "tab-1\u0000thread:https://example.com/thread/button-first";
    const buttonRefresh = vi.fn();
    const wheelRefresh = vi.fn();
    render(
      <WheelProbe
        id="thread"
        edge="bottom"
        cooldownScopeKey={scope}
        onRefresh={() => runManualRefresh(scope, wheelRefresh)}
      />,
    );
    const thread = screen.getByTestId("thread");
    setScrollableMetrics(thread);

    act(() => {
      expect(runManualRefresh(scope, buttonRefresh)).toBe(true);
    });
    expect(thread).toHaveAttribute("data-cooling", "true");
    await vi.advanceTimersByTimeAsync(1000);
    const remainingBeforeRejectedWheel = getManualRefreshCooldownRemainingMs(scope);

    scrollToRefresh(thread, 1);

    expect(wheelRefresh).not.toHaveBeenCalled();
    expect(buttonRefresh).toHaveBeenCalledTimes(1);
    expect(getManualRefreshCooldownRemainingMs(scope)).toBeLessThanOrEqual(
      remainingBeforeRejectedWheel,
    );
    expect(screen.queryByLabelText("ホイール更新中")).toBeNull();
  });

  it("ホイール更新後はボタンの受付も同じ待ち時間で拒否する", () => {
    const scope = "tab-1\u0000thread:https://example.com/thread/wheel-first";
    const wheelRefresh = vi.fn();
    const buttonRefresh = vi.fn();
    render(
      <WheelProbe
        id="thread"
        edge="bottom"
        cooldownScopeKey={scope}
        onRefresh={() => runManualRefresh(scope, wheelRefresh)}
      />,
    );
    const thread = screen.getByTestId("thread");
    setScrollableMetrics(thread);

    scrollToRefresh(thread, 1);

    expect(wheelRefresh).toHaveBeenCalledTimes(1);
    expect(thread).toHaveAttribute("data-cooling", "true");
    expect(runManualRefresh(scope, buttonRefresh)).toBe(false);
    expect(buttonRefresh).not.toHaveBeenCalled();
  });

  it("別tabまたは別URLのcooldownは妨げない", () => {
    const firstScope = "tab-1\u0000thread:https://example.com/thread/one";
    const otherTabScope = "tab-2\u0000thread:https://example.com/thread/one";
    const otherThreadScope = "tab-1\u0000thread:https://example.com/thread/two";
    const refresh = vi.fn();

    act(() => {
      expect(runManualRefresh(firstScope, vi.fn())).toBe(true);
    });
    expect(runManualRefresh(otherTabScope, refresh)).toBe(true);
    expect(runManualRefresh(otherThreadScope, refresh)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("閾値到達前もwheel更新の進捗バーを表示する", () => {
    const refresh = vi.fn();
    render(<WheelProbe id="list" edge="top" onRefresh={refresh} />);
    const list = screen.getByTestId("list");
    setScrollableMetrics(list);

    fireEvent.wheel(list, { deltaY: -1 });

    const progressBar = screen.getByRole("progressbar", { name: "上方向の更新進捗" });
    expect(progressBar).toBeVisible();
    expect(progressBar).toHaveAttribute("aria-valuenow", "1");
    expect(progressBar).toHaveAttribute("aria-valuemax", String(WHEEL_THRESHOLD));
    expect(progressBar.querySelector(".scroll-indicator-progress")).toHaveStyle({
      width: `${(1 / WHEEL_THRESHOLD) * 100}%`,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("読み込み中もindicatorを残してスピナーを表示する", () => {
    render(
      <WheelScrollIndicator direction="down" count={0} threshold={WHEEL_THRESHOLD} isLoading />,
    );

    expect(document.querySelector(".scroll-indicator")).toBeVisible();
    expect(screen.getByLabelText("ホイール更新中")).toBeVisible();
    expect(screen.queryByText(/あと/)).toBeNull();
  });

  it("ホイール操作以外の読み込み開始時に残っていた進捗を破棄する", () => {
    // 変更理由: 自動更新などの外部要因で読み込みが始まっただけで、直前のホイールの
    // 残り方向・進捗と組み合わさって一瞬表示されるのを防ぐ。
    const refresh = vi.fn();
    const { rerender } = render(<WheelProbe id="list" edge="bottom" onRefresh={refresh} />);
    const list = screen.getByTestId("list");
    setScrollableMetrics(list);

    fireEvent.wheel(list, { deltaY: 1 });
    expect(screen.getByRole("progressbar", { name: "下方向の更新進捗" })).toBeVisible();

    rerender(<WheelProbe id="list" edge="bottom" isLoading onRefresh={refresh} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByLabelText("ホイール更新中")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();

    rerender(<WheelProbe id="list" edge="bottom" onRefresh={refresh} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it.each(["top", "bottom"] as const)(
    "%s端の更新は待ち時間内でもロード完了時にスピナーを消す",
    async (edge) => {
      const scope = `tab-1\u0000thread:https://example.com/thread/short-running-${edge}`;
      const onRefresh = () => runManualRefresh(scope, vi.fn());
      const { rerender } = render(
        <WheelProbe id="list" edge={edge} cooldownScopeKey={scope} onRefresh={onRefresh} />,
      );
      const list = screen.getByTestId("list");
      setScrollableMetrics(list);
      scrollToRefresh(list, edge === "top" ? -1 : 1);

      rerender(
        <WheelProbe
          id="list"
          edge={edge}
          cooldownScopeKey={scope}
          isLoading
          onRefresh={onRefresh}
        />,
      );
      expect(screen.getByLabelText("ホイール更新中")).toBeVisible();
      await vi.advanceTimersByTimeAsync(100);

      rerender(<WheelProbe id="list" edge={edge} cooldownScopeKey={scope} onRefresh={onRefresh} />);
      expect(screen.queryByLabelText("ホイール更新中")).toBeNull();
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(list).toHaveAttribute("data-cooling", "true");

      // 完了後の自動更新に前回のホイール由来の表示を引き継がない。
      rerender(
        <WheelProbe
          id="list"
          edge={edge}
          cooldownScopeKey={scope}
          isLoading
          onRefresh={onRefresh}
        />,
      );
      expect(screen.queryByLabelText("ホイール更新中")).toBeNull();
    },
  );

  it.each(["top", "bottom"] as const)(
    "%s端の更新は待ち時間が終わってもロード中はスピナーを維持する",
    async (edge) => {
      const scope = `tab-1\u0000thread:https://example.com/thread/long-running-${edge}`;
      const refresh = vi.fn();
      const onRefresh = () => runManualRefresh(scope, refresh);
      const { rerender } = render(
        <WheelProbe id="list" edge={edge} cooldownScopeKey={scope} onRefresh={onRefresh} />,
      );
      const list = screen.getByTestId("list");
      setScrollableMetrics(list);

      scrollToRefresh(list, edge === "top" ? -1 : 1);
      expect(refresh).toHaveBeenCalledTimes(1);

      // ホイール更新の読み込みがcooldownより長引いても、更新方向が残る間は表示する。
      rerender(
        <WheelProbe
          id="list"
          edge={edge}
          cooldownScopeKey={scope}
          isLoading
          onRefresh={onRefresh}
        />,
      );
      await vi.advanceTimersByTimeAsync(MANUAL_REFRESH_COOLDOWN_MS);
      expect(screen.getByLabelText("ホイール更新中")).toBeInTheDocument();

      rerender(<WheelProbe id="list" edge={edge} cooldownScopeKey={scope} onRefresh={onRefresh} />);
      expect(screen.queryByLabelText("ホイール更新中")).toBeNull();
    },
  );
});
