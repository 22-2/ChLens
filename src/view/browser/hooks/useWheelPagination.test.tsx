import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { WheelScrollIndicator } from "src/view/browser/components/WheelScrollIndicator";
import { useWheelPagination, WHEEL_THRESHOLD } from "src/view/browser/hooks/useWheelPagination";

interface WheelProbeProps {
  edge: "top" | "bottom";
  id: string;
  isLoading?: boolean;
  onRefresh: () => void;
}

function WheelProbe({ edge, id, isLoading = false, onRefresh }: WheelProbeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wheelPagination = useWheelPagination({
    isEnabled: true,
    isLoading,
    containerRef,
    edge,
    onRefresh,
  });

  return (
    <div data-testid={id} ref={containerRef}>
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
    vi.advanceTimersByTime(1000);
    cleanup();
    vi.useRealTimers();
  });

  it("一覧とスレッドのwheel更新でcooldownを共有する", async () => {
    const listRefresh = vi.fn();
    const threadRefresh = vi.fn();
    render(
      <>
        <WheelProbe id="list" edge="top" onRefresh={listRefresh} />
        <WheelProbe id="thread" edge="bottom" onRefresh={threadRefresh} />
      </>,
    );
    const list = screen.getByTestId("list");
    const thread = screen.getByTestId("thread");
    setScrollableMetrics(list);
    setScrollableMetrics(thread);

    scrollToRefresh(list, -1);
    expect(listRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getAllByLabelText("ホイール更新中")).toHaveLength(2);

    scrollToRefresh(thread, 1);
    expect(threadRefresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(screen.queryAllByLabelText("ホイール更新中")).toHaveLength(0);

    scrollToRefresh(thread, 1);
    expect(threadRefresh).toHaveBeenCalledTimes(1);
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

  it("ホイール更新による読み込み中はcooldown終了後もスピナーを維持する", async () => {
    const refresh = vi.fn();
    const { rerender } = render(<WheelProbe id="list" edge="bottom" onRefresh={refresh} />);
    const list = screen.getByTestId("list");
    setScrollableMetrics(list);

    scrollToRefresh(list, 1);
    expect(refresh).toHaveBeenCalledTimes(1);

    // ホイール更新の読み込みがcooldownより長引いても、更新方向が残る間は表示する。
    rerender(<WheelProbe id="list" edge="bottom" isLoading onRefresh={refresh} />);
    await vi.advanceTimersByTimeAsync(1000);
    expect(screen.getByLabelText("ホイール更新中")).toBeInTheDocument();

    rerender(<WheelProbe id="list" edge="bottom" onRefresh={refresh} />);
    expect(screen.queryByLabelText("ホイール更新中")).toBeNull();
  });
});
