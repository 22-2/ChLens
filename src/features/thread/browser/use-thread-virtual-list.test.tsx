import { act, cleanup, renderHook } from "@testing-library/react";
import { NgStatusProvider, useNgStatus } from "src/features/ng/browser/use-ng-status";
import { useThreadVirtualList } from "src/features/thread/browser/use-thread-virtual-list";
import type { IRes } from "src/service-container/interfaces";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  configValue: "hard-ng",
  configUpdatedCallback: undefined as ((data: { key?: string }) => void) | undefined,
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: (key: string) => (key === "display_ng" ? mocks.configValue : null),
      ready: (callback: () => void) => callback(),
    },
    message: {
      on: (_type: string, callback: (data: { key?: string }) => void) => {
        mocks.configUpdatedCallback = callback;
      },
      off: () => {},
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  scrollContainerRef.current = null;
  mocks.configValue = "hard-ng";
  mocks.configUpdatedCallback = undefined;
});

const responses: IRes[] = [
  { num: 1, message: "非表示の先頭レス", ng: { type: "Body" } },
  { num: 2, message: "非表示のレス", ng: { type: "Body" } },
  { num: 3, message: "通常のレス" },
].map((res) => ({ name: "名無し", mail: "", date: "2026/10/25 12:00:00", ...res }));
const scrollContainerRef: { current: HTMLElement | null } = { current: null };

function setup(initialResponses = responses) {
  return renderHook(
    ({ items }) => ({
      list: useThreadVirtualList({
        responses: items,
        replayBoundary: -1,
        scrollContainerRef,
        stickToEnd: false,
        debugKey: "virtual-list:ng-regression",
      }),
      ng: useNgStatus(),
    }),
    { initialProps: { items: initialResponses }, wrapper: NgStatusProvider },
  );
}

describe("TanStack Virtualを使ったレス一覧", () => {
  it("固定ヘッダーの高さをジャンプ先の上余白に反映する", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const panel = document.createElement("div");
    const header = document.createElement("div");
    header.className = "thread-page__sticky-header";
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ height: 72 } as DOMRect);
    panel.appendChild(header);
    scrollContainerRef.current = panel;

    const { result } = setup();
    expect(result.current.list.virtualizer.options.scrollPaddingStart).toBe(72);
  });
  it("NG解除後も非表示レスが実測できるよう、推定高さを確保する", () => {
    const { result } = setup();
    const virtualizer = result.current.list.virtualizer;
    expect(virtualizer.options.estimateSize(0)).toBeGreaterThan(0);
    expect(virtualizer.options.estimateSize(2)).toBeGreaterThan(0);

    act(() => result.current.ng.setNgTemporarilyDisabled(true));

    expect(result.current.list.virtualizer.options.estimateSize(0)).toBeGreaterThan(0);
    expect(result.current.list.virtualizer.options.estimateSize(1)).toBeGreaterThan(0);
    expect(result.current.list.virtualizer.options.estimateSize(2)).toBeGreaterThan(0);
    expect(result.current.list.hasResponse(1)).toBe(true);
  });

  it("レスの並びと再生位置の線を仮想izerへ渡す", () => {
    const { result, rerender } = setup();
    rerender({ items: [...responses, { ...responses[2]!, num: 4 }] });
    expect(result.current.list.keys).toEqual([1, 2, 3, 4]);
    expect(result.current.list.virtualizer.options.count).toBe(4);
    expect(result.current.list.hasResponse(4)).toBe(true);
    expect(result.current.list.hasResponse(99)).toBe(false);
  });
});
