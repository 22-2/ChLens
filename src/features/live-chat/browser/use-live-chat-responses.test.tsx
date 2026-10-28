import { act, cleanup, renderHook } from "@testing-library/react";
import { useLiveChatResponses } from "src/features/live-chat/browser/use-live-chat-responses";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const rows = (...nums: number[]) => nums.map((num) => ({ num, message: `本文${num}` }));
const initial = {
  responses: rows(1, 2),
  scopeKey: "tab-a/thread-a",
  enabled: true,
  isActive: true,
  isAutoRefreshEnabled: true,
  isFetching: false,
  intervalMs: 20000,
  paused: false,
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

  it("一時停止中の新着はキューに残し、再開すると未表示の先頭から順に流す", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    const batch = { ...initial, responses: rows(1, 2, 3, 4, 5) };
    rerender(batch);
    advance(600);
    expect(result.current.responses).toEqual(rows(1, 2, 3));
    advance(300);
    rerender({ ...batch, paused: true });
    rerender({ ...batch, responses: rows(1, 2, 3, 4, 5, 6), paused: true });
    advance(60_000);

    expect(result.current.responses).toEqual(rows(1, 2, 3));
    expect(result.current.pendingCount).toBe(3);
    // 未表示分を残すので、満了停止や次スレ移動も再生完了までは待つ。
    expect(result.current.isDraining).toBe(true);
    expect(result.current.isFlowing).toBe(true);

    rerender({ ...batch, responses: rows(1, 2, 3, 4, 5, 6) });
    advance(599);
    expect(result.current.responses).toEqual(rows(1, 2, 3));
    advance(1);
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4));
    advance(600);
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4, 5));
    advance(600);
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4, 5, 6));
    advance(50);
    expect(result.current.isDraining).toBe(false);
  });

  it("一時停止中に上限を超えても表示を進めず、再開時に末尾だけを流して追いつく", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    const responses = rows(...Array.from({ length: 102 }, (_, i) => i + 1));
    rerender({ ...initial, paused: true });
    rerender({ ...initial, paused: true, responses });
    advance(60_000);
    expect(result.current.responses).toEqual(rows(1, 2));
    expect(result.current.pendingCount).toBe(100);
    expect(result.current.baseline).toBe(2);

    rerender({ ...initial, responses });
    expect(result.current.responses).toEqual(responses.slice(0, 92));
    expect(result.current.pendingCount).toBe(10);
    expect(result.current.baseline).toBe(92);
    for (let i = 0; i < 10; i++) advance(600);
    expect(result.current.responses).toEqual(responses);
    expect(result.current.pendingCount).toBe(0);
  });

  it("一時停止と再開を短時間で繰り返しても未表示のレスを飛ばしたり重ねたりしない", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    const batch = { ...initial, responses: rows(1, 2, 3, 4) };
    rerender(batch);
    for (let i = 0; i < 20; i++) {
      advance(50);
      rerender({ ...batch, paused: true });
      advance(50);
      rerender(batch);
    }
    expect(result.current.responses).toEqual(rows(1, 2));
    expect(result.current.pendingCount).toBe(2);
    advance(599);
    expect(result.current.responses).toEqual(rows(1, 2));
    advance(1);
    expect(result.current.responses).toEqual(rows(1, 2, 3));
    advance(600);
    expect(result.current.responses).toEqual(batch.responses);
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

  it("非表示の間に届いた新着は流さず、復帰時にすぐ追いつく", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    rerender({ ...initial, responses: rows(1, 2, 3), isActive: false });
    expect(result.current.isDraining).toBe(false);
    rerender({ ...initial, responses: rows(1, 2, 3) });
    expect(result.current.responses).toEqual(rows(1, 2, 3));
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.baseline).toBe(3);
  });

  it("タブ復帰直後の取得分は流さず、その次の取得から流す", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    rerender({ ...initial, isActive: false });
    rerender(initial);
    rerender({ ...initial, isFetching: true });
    rerender({ ...initial, isFetching: true, responses: rows(1, 2, 3, 4) });
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4));
    rerender({ ...initial, responses: rows(1, 2, 3, 4) });
    rerender({ ...initial, responses: rows(1, 2, 3, 4, 5) });
    expect(result.current.pendingCount).toBe(1);
  });

  it("過去レスを読んでいる間は一括表示し、末尾に戻ると新着を流す", () => {
    const following = { ...initial, isFollowing: true };
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: following });
    rerender({ ...following, responses: rows(1, 2, 3, 4) });
    expect(result.current.pendingCount).toBe(2);
    rerender({ ...following, isFollowing: false, responses: rows(1, 2, 3, 4) });
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4));
    rerender({ ...following, isFollowing: false, responses: rows(1, 2, 3, 4, 5) });
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4, 5));
    rerender({ ...following, responses: rows(1, 2, 3, 4, 5) });
    rerender({ ...following, responses: rows(1, 2, 3, 4, 5, 6) });
    expect(result.current.pendingCount).toBe(1);
  });

  it("流している途中で非表示になっても、復帰時は残りを待たずに表示する", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    rerender({ ...initial, responses: rows(1, 2, 3, 4) });
    advance(600);
    rerender({ ...initial, responses: rows(1, 2, 3, 4), isActive: false });
    rerender({ ...initial, responses: rows(1, 2, 3, 4) });
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4));
  });

  it("自動更新OFFの手動更新では新着を流さずすぐ表示する", () => {
    const off = { ...initial, isAutoRefreshEnabled: false };
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: off });
    rerender({ ...off, responses: rows(1, 2, 3, 4) });
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4));
    expect(result.current.isFlowing).toBe(false);
    expect(result.current.isDraining).toBe(false);
  });

  it("dat落ちなどで自動更新が止まったら、流している残りをすぐ表示する", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    rerender({ ...initial, responses: rows(1, 2, 3, 4) });
    rerender({ ...initial, responses: rows(1, 2, 3, 4), isAutoRefreshEnabled: false });
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4));
  });

  it("自動更新をONにした直後の再取得分は流さず、その次の取得から流す", () => {
    const off = { ...initial, isAutoRefreshEnabled: false };
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: off });
    // ONを反映した描画ではまだ再取得が始まっていない。
    rerender(initial);
    rerender({ ...initial, isFetching: true });
    rerender({ ...initial, isFetching: true, responses: rows(1, 2, 3, 4) });
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4));
    expect(result.current.baseline).toBe(4);
    rerender({ ...initial, responses: rows(1, 2, 3, 4) });
    rerender({ ...initial, responses: rows(1, 2, 3, 4, 5) });
    expect(result.current.responses).toEqual(rows(1, 2, 3, 4));
    expect(result.current.pendingCount).toBe(1);
  });

  it("自動更新ON直後の再取得が新着なしなら、その次の取得から流す", () => {
    const off = { ...initial, isAutoRefreshEnabled: false };
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: off });
    rerender(initial);
    rerender({ ...initial, isFetching: true });
    rerender(initial);
    rerender({ ...initial, responses: rows(1, 2, 3) });
    expect(result.current.responses).toEqual(rows(1, 2));
    expect(result.current.pendingCount).toBe(1);
  });

  it("次スレでは旧スレの予約と番号を捨て、新スレの初回表示を揃える", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    rerender({ ...initial, responses: rows(1, 2, 3, 4) });
    rerender({ ...initial, scopeKey: "tab-a/thread-b", responses: rows(1) });
    advance(1000);
    expect(result.current.responses).toEqual(rows(1));
    expect(result.current.baseline).toBe(1);
  });

  it("新着が多くても件数で飛ばさず、取得間隔と件数に応じた速さで流す", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    const responses = rows(...Array.from({ length: 102 }, (_, i) => i + 1));
    rerender({ ...initial, responses });
    expect(result.current.responses).toEqual(rows(1, 2));
    expect(result.current.pendingCount).toBe(100);
    advance(200);
    expect(result.current.responses).toEqual(rows(1, 2, 3));
    advance(9800);
    expect(result.current.responses.at(-1)?.num).toBe(52);
    advance(10000);
    expect(result.current.responses).toEqual(responses);
    expect(result.current.pendingCount).toBe(0);
  });

  it("描画間隔より速いペースでは複数レスをまとめて流して追いつく", () => {
    const fast = { ...initial, intervalMs: 5000 };
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: fast });
    const responses = rows(...Array.from({ length: 1002 }, (_, i) => i + 1));
    rerender({ ...fast, responses });
    advance(16);
    expect(result.current.responses.at(-1)?.num).toBe(5);
    advance(2480);
    expect(result.current.responses.length).toBeGreaterThanOrEqual(500);
    advance(2512);
    expect(result.current.responses).toEqual(responses);
  });

  it("高速再生中の一時停止でも新着を進めず、再開後は残りから流す", () => {
    const fast = { ...initial, intervalMs: 5000 };
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: fast });
    const responses = rows(...Array.from({ length: 102 }, (_, i) => i + 1));
    rerender({ ...fast, responses });
    advance(50);
    expect(result.current.responses.at(-1)?.num).toBe(3);
    rerender({ ...fast, responses, paused: true });
    advance(10000);
    expect(result.current.responses.at(-1)?.num).toBe(3);
    rerender({ ...fast, responses });
    expect(result.current.responses.at(-1)?.num).toBe(92);
    for (let i = 0; i < 10; i++) advance(600);
    expect(result.current.responses).toEqual(responses);
  });

  it("設定値より長い実際の取得間隔に合わせて流す", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    rerender({ ...initial, isFetching: true });
    advance(100);
    rerender(initial);
    advance(30000);
    const responses = rows(...Array.from({ length: 102 }, (_, i) => i + 1));
    rerender({ ...initial, isFetching: true, responses });
    advance(300);
    expect(result.current.responses).toEqual(rows(1, 2, 3));
    advance(14700);
    expect(result.current.responses.at(-1)?.num).toBe(52);
  });

  it("前の取得分を流している間に新着が増えても順番を維持して追いつく", () => {
    const fast = { ...initial, intervalMs: 5000 };
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: fast });
    const first = rows(...Array.from({ length: 102 }, (_, i) => i + 1));
    rerender({ ...fast, responses: first });
    advance(2500);
    expect(result.current.responses.at(-1)?.num).toBe(52);
    const second = rows(...Array.from({ length: 202 }, (_, i) => i + 1));
    rerender({ ...fast, responses: second });
    expect(result.current.responses.at(-1)?.num).toBe(52);
    advance(5008);
    expect(result.current.responses).toEqual(second);
  });

  it("上限以内の新着は間隔を詰めて次の取得前に全件を流し、途中の追加を欠落させない", () => {
    const { result, rerender } = renderHook(useLiveChatResponses, { initialProps: initial });
    const first = rows(...Array.from({ length: 32 }, (_, i) => i + 1));
    rerender({ ...initial, responses: first });
    for (let i = 0; i < 15; i++) advance(600);
    const second = rows(...Array.from({ length: 42 }, (_, i) => i + 1));
    rerender({ ...initial, responses: second });
    for (let i = 0; i < 40; i++) advance(600);
    expect(result.current.responses).toEqual(second);
    expect(result.current.pendingCount).toBe(0);
  });
});
