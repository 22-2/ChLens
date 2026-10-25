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
  mocks.configValue = "hard-ng";
  mocks.configUpdatedCallback = undefined;
});

const responses: IRes[] = [
  { num: 1, message: "非表示の先頭レス", ng: { type: "Body" } },
  { num: 2, message: "非表示のレス", ng: { type: "Body" } },
  { num: 3, message: "通常のレス" },
].map((res) => ({ name: "名無し", mail: "", date: "2026/10/25 12:00:00", ...res }));
const scrollContainerRef = { current: null };

function setup(initialResponses = responses) {
  const hook = renderHook(
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
  const controller = hook.result.current.list.controller;
  act(() => {
    controller.updateViewport({ scrollTop: 0, height: 50, listTop: 0, trailing: 0 });
    // hard-ngで何も描かず、実測した高さ0のレスが描画範囲から外れた状態。
    controller.reportSizes([
      { key: 1, size: 0 },
      { key: 2, size: 0 },
      { key: 3, size: 100 },
    ]);
  });
  expect(controller.getSnapshot().items.map((item) => item.key)).toEqual([3]);
  return { ...hook, controller };
}

describe("仮想レス一覧のNG表示切替", () => {
  it("NG一時解除を繰り返しても高さ0のレスが再描画され、通常レスの実測値を維持する", () => {
    const { result, controller } = setup();

    for (let cycle = 0; cycle < 3; cycle++) {
      act(() => result.current.ng.setNgTemporarilyDisabled(true));

      expect(controller.getItem(1)?.size).toBeGreaterThan(0);
      expect(controller.getItem(2)?.size).toBeGreaterThan(0);
      expect(controller.getSnapshot().items.map((item) => item.key)).toEqual([1, 2, 3]);
      expect(controller.getItem(3)?.size).toBe(100);

      act(() =>
        controller.reportSizes([
          { key: 1, size: 200 },
          { key: 2, size: 100 },
        ]),
      );
      act(() => result.current.ng.setNgTemporarilyDisabled(false));
      act(() =>
        controller.reportSizes([
          { key: 1, size: 0 },
          { key: 2, size: 0 },
        ]),
      );
      expect(controller.getSnapshot().items.map((item) => item.key)).toEqual([3]);
    }
  });

  it("完全非表示からクリックで表示へ変更すると、高さ0の先頭レスも再描画する", () => {
    const { controller } = setup();

    act(() => {
      mocks.configValue = "soft-ng";
      mocks.configUpdatedCallback?.({ key: "display_ng" });
    });

    expect(controller.getItem(1)?.size).toBeGreaterThan(0);
    expect(controller.getSnapshot().items.map((item) => item.key)).toEqual([1, 2, 3]);
    expect(controller.getItem(3)?.size).toBe(100);
  });

  it("NGルールの変更でNG判定が外れたレスも、高さ0の実測値を使い続けない", () => {
    const { rerender, controller } = setup();

    rerender({ items: responses.map((res) => ({ ...res, ng: undefined })) });

    expect(controller.getItem(1)?.size).toBeGreaterThan(0);
    expect(controller.getItem(2)?.size).toBeGreaterThan(0);
    expect(controller.getItem(3)?.size).toBe(100);
  });
});
