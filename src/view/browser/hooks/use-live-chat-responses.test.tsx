import { act, cleanup, renderHook } from "@testing-library/react";
import { useLiveChatResponses } from "src/view/browser/hooks/use-live-chat-responses";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const rows = (...nums: number[]) => nums.map((num) => ({ num, message: `本文${num}` }));
const initial = {
  responses: rows(1, 2),
  scopeKey: "tab-a/thread-a",
  enabled: true,
  isActive: true,
  intervalMs: 20000,
};
const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("ライブチャットの新着表示", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("初回のレスは待たずに表示し、新着バッチだけを一件ずつ流す", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    expect(result.current.responses).toEqual(rows(1, 2));
    rerender({ ...initial, responses: rows(1, 2, 3, 4, 5) });
    expect(result.current.responses).toEqual(rows(1, 2));
    advance(599);
    expect(result.current.pendingCount).toBe(3);
    advance(1);
    expect(result.current.responses).toEqual(rows(1, 2, 3));
    advance(600);
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4));
    advance(600);
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4, 5));
    expect(result.current.isDraining).toBe(true);
    advance(50);
    expect(result.current.isDraining).toBe(false);
  });

  it("キャッシュがない初回取得も全件をすぐ表示する", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, {
      initialProps: { ...initial, responses: rows() },
    });
    rerender({ ...initial, responses: rows(1, 2, 3) });
    expect(result.current.responses).toEqual(rows(1, 2, 3));
    expect(result.current.pendingCount).toBe(0);
  });

  it("同じ末尾番号の再取得で予約をやり直さず、本文の更新を反映する", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    rerender({ ...initial, responses: rows(1, 2, 3) });
    advance(300);
    const updated = rows(1, 2, 3).map((res) => ({ ...res, message: "更新後" }));
    rerender({ ...initial, responses: updated });
    advance(300);
    expect(result.current.responses).toEqual(updated);
  });

  it("通常への切り替えで全件を表示し、再開時に過去レスを流し直さない", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    rerender({ ...initial, responses: rows(1, 2, 3, 4) });
    rerender({ ...initial, enabled: false, responses: rows(1, 2, 3, 4) });
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4));
    advance(1000);
    rerender({ ...initial, responses: rows(1, 2, 3, 4) });
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.baseline).toBe(4);
  });

  it("非表示タブでは流す予約を止め、復帰時は未表示レスから再開する", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    rerender({ ...initial, responses: rows(1, 2, 3), isActive: false });
    advance(5000);
    expect(result.current.responses).toEqual(rows(1, 2));
    rerender({ ...initial, responses: rows(1, 2, 3) });
    advance(600);
    expect(result.current.responses).toEqual(rows(1, 2, 3));
  });

  it("次スレでは旧スレの予約と番号を捨て、新スレの初回表示を揃える", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    rerender({ ...initial, responses: rows(1, 2, 3, 4) });
    rerender({ ...initial, scopeKey: "tab-a/thread-b", responses: rows(1) });
    advance(1000);
    expect(result.current.responses).toEqual(rows(1));
    expect(result.current.baseline).toBe(1);
  });

  it("大量の新着でも間隔を詰めて次の取得前に全件を流し、途中の追加を欠落させない", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    const first = rows(...Array.from({ length: 102 }, (_, i) => i + 1));
    rerender({ ...initial, responses: first });
    for (let i = 0; i < 50; i++) advance(160);
    const second = rows(...Array.from({ length: 152 }, (_, i) => i + 1));
    rerender({ ...initial, responses: second });
    for (let i = 0; i < 100; i++) advance(160);
    expect(result.current.responses).toEqual(second);
    expect(result.current.pendingCount).toBe(0);
  });
});
