import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import React from "react";
import { ThreadMinimap } from "src/view/browser/components/ThreadMinimap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CANVAS_CONTEXT_STUB = {
  save: vi.fn(),
  scale: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  restore: vi.fn(),
};

describe("ThreadMinimap", () => {
  beforeEach(() => {
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

    Object.defineProperty(panel, "clientWidth", { configurable: true, value: 1000 });
    Object.defineProperty(panel, "offsetWidth", { configurable: true, value: 1012 });
    Object.defineProperty(panel, "clientHeight", { configurable: true, value: 600 });
    Object.defineProperty(panel, "scrollHeight", { configurable: true, value: 2400 });
    Object.defineProperty(panel, "scrollTop", { configurable: true, value: 120 });
    Object.defineProperty(response, "offsetHeight", { configurable: true, value: 48 });
    Object.defineProperty(response, "offsetTop", { configurable: true, value: 300 });
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

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(
      <ThreadMinimap
        rootRef={rootRef}
        repIndex={repIndex}
        responseCount={1}
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
});
