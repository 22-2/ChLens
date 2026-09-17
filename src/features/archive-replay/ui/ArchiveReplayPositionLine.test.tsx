import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ArchiveReplayPositionLine, getReplayBoundaryIndex } from "./ArchiveReplayPositionLine";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("過去実況の再生位置ライン", () => {
  const responses = [
    { num: 1, date: "2026/09/16 23:30:00" },
    { num: 3, date: "2026/09/16 23:30:10.500" },
    { num: 4, date: "2026/09/16 23:30:20" },
  ];
  it("開始前・レス間・末尾と巻き戻しをログ時刻で判定する", () => {
    const at = (time: string) => Date.parse(`2026-09-16T${time}+09:00`);
    expect(getReplayBoundaryIndex(responses, at("23:29:59"), 1)).toBe(0);
    expect(getReplayBoundaryIndex(responses, at("23:30:10"), 3)).toBe(1);
    expect(getReplayBoundaryIndex(responses, at("23:30:10.500"), 3)).toBe(2);
    expect(getReplayBoundaryIndex(responses, at("23:30:25"), 4)).toBe(3);
    expect(getReplayBoundaryIndex(responses, at("23:30:05"), 1)).toBe(1);
  });
  it("日本時間を表示し、秒だけの更新ではスクロールし直さない", () => {
    vi.useFakeTimers();
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scroll,
    });
    const at = Date.parse("2026-09-16T23:30:05+09:00");
    const { rerender } = render(<ArchiveReplayPositionLine playbackAt={at} boundary={1} active />);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByRole("separator")).toHaveTextContent("再生位置 23:30:05");
    expect(scroll).toHaveBeenCalledTimes(1);
    rerender(<ArchiveReplayPositionLine playbackAt={at + 1000} boundary={1} active />);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(scroll).toHaveBeenCalledTimes(1);
    rerender(<ArchiveReplayPositionLine playbackAt={at + 10000} boundary={2} active />);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(scroll).toHaveBeenCalledTimes(2);
  });
});
