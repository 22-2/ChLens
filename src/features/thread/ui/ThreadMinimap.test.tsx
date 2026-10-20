import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import type { ThreadResponseLayout } from "src/features/thread/browser/use-thread-virtual-list";
import { ThreadMinimap } from "src/features/thread/ui/ThreadMinimap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const CANVAS_CONTEXT_STUB = {
  save: vi.fn(),
  scale: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  restore: vi.fn(),
};

/** レス番号・リスト内の位置・高さから、ミニマップが読む位置情報を作る。 */
function createResponseLayout(entries: Array<[number, number, number]>): ThreadResponseLayout {
  return {
    getListTop: () => 0,
    getResponseBox: (resNum) => {
      const entry = entries.find(([num]) => num === resNum);
      return entry ? { top: entry[1], size: entry[2] } : null;
    },
    forEachResponse: (callback) => {
      for (const [num, top, size] of entries) callback(num, top, size);
    },
    subscribe: () => () => {},
  };
}

describe("ThreadMinimap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => CANVAS_CONTEXT_STUB as unknown as CanvasRenderingContext2D,
    );

    class ResizeObserverStub {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("安定したレイアウトでは無限 update loop せず表示できる", async () => {
    const panel = document.createElement("div");
    panel.className = "content-area__tab-panel";
    const host = document.createElement("div");
    host.className = "thread-page";
    const responses = document.createElement("div");
    responses.className = "thread-page__responses";
    const response = document.createElement("div");
    response.dataset.resNum = "10";
    responses.append(response);
    host.append(responses);
    panel.append(host);
    document.body.append(panel);

    Object.defineProperty(panel, "clientWidth", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(panel, "offsetWidth", {
      configurable: true,
      value: 1012,
    });
    Object.defineProperty(panel, "clientHeight", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(panel, "scrollHeight", {
      configurable: true,
      value: 2400,
    });
    Object.defineProperty(panel, "scrollTop", {
      configurable: true,
      value: 120,
    });
    Object.defineProperty(response, "offsetHeight", {
      configurable: true,
      value: 48,
    });
    Object.defineProperty(response, "offsetTop", {
      configurable: true,
      value: 300,
    });
    panel.scrollTo = vi.fn();
    panel.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 1000,
        bottom: 600,
        width: 1000,
        height: 600,
        toJSON: () => ({}),
      }) as DOMRect;
    host.getBoundingClientRect = () => panel.getBoundingClientRect();
    responses.getBoundingClientRect = () => panel.getBoundingClientRect();

    const rootRef = { current: host } as React.RefObject<HTMLDivElement | null>;
    const repIndex = new Map<number, Set<number>>([[10, new Set([11, 12, 13])]]);

    // Reactの警告出力を検査するため、ロガーを通さない console を直接監視する。
    // eslint-disable-next-line no-console
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(
      <ThreadMinimap
        rootRef={rootRef}
        layout={createResponseLayout([[10, 300, 48]])}
        repIndex={repIndex}
        responseCount={1}
        activeTopBar="none"
        onMarkerClick={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".thread-page__minimap")).toBeInTheDocument();
    });

    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        String(call[0] ?? "").includes("Maximum update depth exceeded"),
      ),
    ).toBe(false);
  });

  it("ホバー位置にラインを描き、近くの人気レスへ吸着する", async () => {
    const panel = document.createElement("div");
    panel.className = "content-area__tab-panel";
    const host = document.createElement("div");
    host.className = "thread-page";
    const responses = document.createElement("div");
    responses.className = "thread-page__responses";
    const response = document.createElement("div");
    response.dataset.resNum = "10";
    responses.append(response);
    host.append(responses);
    panel.append(host);
    document.body.append(panel);

    Object.defineProperties(panel, {
      clientWidth: { configurable: true, value: 1000 },
      offsetWidth: { configurable: true, value: 1012 },
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 2400 },
      scrollTop: { configurable: true, value: 120 },
    });
    Object.defineProperties(response, {
      offsetHeight: { configurable: true, value: 48 },
      offsetTop: { configurable: true, value: 300 },
    });
    Object.defineProperty(responses, "offsetParent", {
      configurable: true,
      value: panel,
    });
    panel.scrollTo = vi.fn();
    panel.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 1000,
        bottom: 600,
        width: 1000,
        height: 600,
      }) as DOMRect;
    responses.getBoundingClientRect = () => panel.getBoundingClientRect();

    const rootRef = { current: host } as React.RefObject<HTMLDivElement | null>;
    const repIndex = new Map<number, Set<number>>([[10, new Set([11, 12, 13])]]);
    const { container } = render(
      <ThreadMinimap
        rootRef={rootRef}
        layout={createResponseLayout([[10, 300, 48]])}
        repIndex={repIndex}
        responseCount={1}
        activeTopBar="none"
        onMarkerClick={() => {}}
      />,
    );

    const canvas = await waitFor(() => {
      const element = container.querySelector(".thread-page__minimap-canvas");
      expect(element).toBeInTheDocument();
      return element as HTMLCanvasElement;
    });

    // レスが1件なのでマーカーは中央の 300px。8px以内の 302px ではその位置へ吸着する。
    fireEvent.pointerMove(canvas, {
      clientX: 920,
      clientY: 302,
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(CANVAS_CONTEXT_STUB.moveTo).toHaveBeenLastCalledWith(0, 300.5);
    expect(CANVAS_CONTEXT_STUB.lineTo).toHaveBeenLastCalledWith(82, 300.5);
    expect(document.body.querySelector('[role="tooltip"]')).toHaveTextContent("レス 10");
    expect(document.body.querySelector('[role="tooltip"]')).toHaveStyle({ top: "300px" });

    fireEvent.pointerMove(canvas, {
      clientX: 920,
      clientY: 100,
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(CANVAS_CONTEXT_STUB.moveTo).toHaveBeenLastCalledWith(0, 100.5);
    // ラベルはキャンバス中央固定ではなく、ホバー中の青線と同じYへ動く。
    expect(document.body.querySelector('[role="tooltip"]')).toHaveStyle({ top: "100px" });

    const lineCount = CANVAS_CONTEXT_STUB.moveTo.mock.calls.filter(([x]) => x === 0).length;
    fireEvent.pointerLeave(canvas);
    expect(CANVAS_CONTEXT_STUB.moveTo.mock.calls.filter(([x]) => x === 0)).toHaveLength(lineCount);
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("スティッチ表示中のクリックで注目レスを飛んで強調する", async () => {
    const panel = document.createElement("div");
    panel.className = "content-area__tab-panel";
    const host = document.createElement("div");
    host.className = "thread-page";
    const responses = document.createElement("div");
    responses.className = "thread-page__responses";
    const response = document.createElement("div");
    response.dataset.resNum = "10";
    responses.append(response);
    host.append(responses);
    panel.append(host);
    document.body.append(panel);

    Object.defineProperties(panel, {
      clientWidth: { configurable: true, value: 1000 },
      offsetWidth: { configurable: true, value: 1012 },
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 2400 },
      scrollTop: { configurable: true, value: 120 },
    });
    Object.defineProperties(response, {
      offsetHeight: { configurable: true, value: 48 },
      offsetTop: { configurable: true, value: 300 },
    });
    Object.defineProperty(responses, "offsetParent", {
      configurable: true,
      value: panel,
    });
    panel.scrollTo = vi.fn();
    panel.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 1000,
        bottom: 600,
        width: 1000,
        height: 600,
      }) as DOMRect;
    responses.getBoundingClientRect = () => panel.getBoundingClientRect();

    const rootRef = { current: host } as React.RefObject<HTMLDivElement | null>;
    const repIndex = new Map<number, Set<number>>([[10, new Set([11, 12, 13])]]);
    const onMarkerClick = vi.fn();
    const { container } = render(
      <ThreadMinimap
        rootRef={rootRef}
        layout={createResponseLayout([[10, 300, 48]])}
        repIndex={repIndex}
        responseCount={1}
        activeTopBar="none"
        onMarkerClick={onMarkerClick}
      />,
    );

    const canvas = await waitFor(() => {
      const element = container.querySelector(".thread-page__minimap-canvas");
      expect(element).toBeInTheDocument();
      return element as HTMLCanvasElement;
    });
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    canvas.releasePointerCapture = vi.fn();

    // マーカー直上ではなく中央寄りのクリックでも、ホバーが吸着していれば注目レス扱いにする。
    fireEvent.pointerMove(canvas, {
      clientX: 920,
      clientY: 306,
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(document.body.querySelector('[role="tooltip"]')).toHaveTextContent("レス 10");

    fireEvent.pointerDown(canvas, {
      clientX: 920,
      clientY: 306,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    });
    fireEvent.pointerUp(canvas, {
      clientX: 920,
      clientY: 306,
      pointerId: 1,
      pointerType: "mouse",
    });

    // 変更理由: スティッチ表示中のクリックは対象レスへ飛んで強調し、飛び先を見失わないようにする。
    expect(onMarkerClick).toHaveBeenCalledTimes(1);
    expect(onMarkerClick).toHaveBeenCalledWith(10);
  });

  it("ドラッグによるスクロールでは注目レスを強調しない", async () => {
    const panel = document.createElement("div");
    panel.className = "content-area__tab-panel";
    const host = document.createElement("div");
    host.className = "thread-page";
    const responses = document.createElement("div");
    responses.className = "thread-page__responses";
    const response = document.createElement("div");
    response.dataset.resNum = "10";
    responses.append(response);
    host.append(responses);
    panel.append(host);
    document.body.append(panel);

    Object.defineProperties(panel, {
      clientWidth: { configurable: true, value: 1000 },
      offsetWidth: { configurable: true, value: 1012 },
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 2400 },
      scrollTop: { configurable: true, value: 120 },
    });
    Object.defineProperties(response, {
      offsetHeight: { configurable: true, value: 48 },
      offsetTop: { configurable: true, value: 300 },
    });
    Object.defineProperty(responses, "offsetParent", {
      configurable: true,
      value: panel,
    });
    panel.scrollTo = vi.fn();
    panel.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 1000,
        bottom: 600,
        width: 1000,
        height: 600,
      }) as DOMRect;
    responses.getBoundingClientRect = () => panel.getBoundingClientRect();

    const rootRef = { current: host } as React.RefObject<HTMLDivElement | null>;
    const repIndex = new Map<number, Set<number>>([[10, new Set([11, 12, 13])]]);
    const onMarkerClick = vi.fn();
    const { container } = render(
      <ThreadMinimap
        rootRef={rootRef}
        layout={createResponseLayout([[10, 300, 48]])}
        repIndex={repIndex}
        responseCount={1}
        activeTopBar="none"
        onMarkerClick={onMarkerClick}
      />,
    );

    const canvas = await waitFor(() => {
      const element = container.querySelector(".thread-page__minimap-canvas");
      expect(element).toBeInTheDocument();
      return element as HTMLCanvasElement;
    });
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    canvas.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(canvas, {
      clientX: 920,
      clientY: 82,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    });
    fireEvent.pointerMove(canvas, {
      clientX: 920,
      clientY: 300,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(canvas, {
      clientX: 920,
      clientY: 300,
      pointerId: 1,
      pointerType: "mouse",
    });

    // 変更理由: ドラッグは視点移動が目的なので、離しても対象レスの強調は行わない。
    expect(panel.scrollTo).toHaveBeenCalled();
    expect(onMarkerClick).not.toHaveBeenCalled();
  });

  it("高さの実測値が変わっても人気レスの縦位置は変わらない", async () => {
    const panel = document.createElement("div");
    panel.className = "content-area__tab-panel";
    const host = document.createElement("div");
    host.className = "thread-page";
    const responses = document.createElement("div");
    responses.className = "thread-page__responses";
    host.append(responses);
    panel.append(host);
    document.body.append(panel);

    Object.defineProperties(panel, {
      clientWidth: { configurable: true, value: 1000 },
      offsetWidth: { configurable: true, value: 1012 },
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 2400 },
      scrollTop: { configurable: true, value: 120 },
    });
    panel.scrollTo = vi.fn();
    panel.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 1000,
        bottom: 600,
        width: 1000,
        height: 600,
      }) as DOMRect;
    responses.getBoundingClientRect = () => panel.getBoundingClientRect();

    const rootRef = { current: host } as React.RefObject<HTMLDivElement | null>;
    const repIndex = new Map<number, Set<number>>([[20, new Set([21, 22, 23])]]);
    const { container, rerender } = render(
      <ThreadMinimap
        rootRef={rootRef}
        layout={createResponseLayout([
          [10, 0, 100],
          [20, 200, 100],
        ])}
        repIndex={repIndex}
        responseCount={2}
        activeTopBar="none"
        onMarkerClick={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".thread-page__minimap-canvas")).toBeInTheDocument();
    });

    const markerY = (): number => {
      // 三角の先端（markerX - 幅8px）を moveTo したYがマーカー中心。
      const call = [...CANVAS_CONTEXT_STUB.moveTo.mock.calls]
        .reverse()
        .find((args) => args[0] === 68);
      expect(call).toBeDefined();
      return call![1] as number;
    };
    expect(markerY()).toBe(450);

    const drawCount = CANVAS_CONTEXT_STUB.moveTo.mock.calls.length;
    // 実測により先頭レスの高さが伸び、全体の高さと人気レスまでのピクセル距離が変わる状況を再現する。
    rerender(
      <ThreadMinimap
        rootRef={rootRef}
        layout={createResponseLayout([
          [10, 0, 400],
          [20, 700, 100],
        ])}
        repIndex={repIndex}
        responseCount={2}
        activeTopBar="none"
        onMarkerClick={() => {}}
      />,
    );

    await waitFor(() => {
      expect(CANVAS_CONTEXT_STUB.moveTo.mock.calls.length).toBeGreaterThan(drawCount);
    });
    // レス順位は 2件中の2番目のままなので、高さが変わってもマーカーは中央下（450px）に留まる。
    expect(markerY()).toBe(450);
  });
});
