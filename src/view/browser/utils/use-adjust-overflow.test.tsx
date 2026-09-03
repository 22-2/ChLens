import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import {
  getPopupViewportBounds,
  useAdjustOverflow,
} from "src/view/browser/utils/use-adjust-overflow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

describe("getPopupViewportBounds", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ステータスバーがある時はその上端までを有効ビューポートにする", () => {
    const statusBar = document.createElement("footer");
    statusBar.className = "status-bar";
    statusBar.getBoundingClientRect = () => ({ top: 696, bottom: 720, height: 24 }) as DOMRect;
    document.body.appendChild(statusBar);

    expect(getPopupViewportBounds()).toEqual({
      left: 0,
      top: 0,
      right: 1280,
      bottom: 696,
      width: 1280,
      height: 696,
    });
  });

  it("ステータスバーが無い時は通常のwindow内寸を返す", () => {
    expect(getPopupViewportBounds()).toEqual({
      left: 0,
      top: 0,
      right: 1280,
      bottom: 720,
      width: 1280,
      height: 720,
    });
  });
});

describe("useAdjustOverflow", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("下端補正でステータスバー領域を避ける", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });

    const statusBar = document.createElement("footer");
    statusBar.className = "status-bar";
    statusBar.getBoundingClientRect = () => ({ top: 696, bottom: 720, height: 24 }) as DOMRect;
    document.body.appendChild(statusBar);

    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function mockGetBoundingClientRect(this: HTMLElement) {
        if (this.classList.contains("status-bar")) {
          return { top: 696, bottom: 720, height: 24 } as DOMRect;
        }
        if (this.dataset.testid === "popup") {
          return {
            left: 100,
            top: 650,
            right: 300,
            bottom: 750,
            width: 200,
            height: 100,
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
        } as DOMRect;
      });

    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      useAdjustOverflow(ref, 8);

      return <div ref={ref} data-testid="popup" style={{ left: 100, top: 650 }} />;
    }

    const { getByTestId } = render(<Harness />);
    const popup = getByTestId("popup") as HTMLDivElement;

    expect(popup.style.top).toBe("588px");
    getBoundingClientRectSpy.mockRestore();
  });

  it("ポップアップの寸法変更後も下端補正を再適用する", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });

    const statusBar = document.createElement("footer");
    statusBar.className = "status-bar";
    statusBar.getBoundingClientRect = () => ({ top: 696, bottom: 720, height: 24 }) as DOMRect;
    document.body.appendChild(statusBar);

    let popupHeight = 100;
    let triggerResizeObserver: (() => void) | undefined;
    class ResizeObserverStub {
      constructor(callback: ResizeObserverCallback) {
        triggerResizeObserver = () => callback([], this as unknown as ResizeObserver);
      }

      observe(): void {}

      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);

    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function mockGetBoundingClientRect(this: HTMLElement) {
        if (this.classList.contains("status-bar")) {
          return { top: 696, bottom: 720, height: 24 } as DOMRect;
        }
        if (this.dataset.testid === "popup") {
          const top = Number.parseFloat(this.style.top) || 650;
          return {
            left: 100,
            top,
            right: 300,
            bottom: top + popupHeight,
            width: 200,
            height: popupHeight,
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
        } as DOMRect;
      });

    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      useAdjustOverflow(ref, 8);

      return <div ref={ref} data-testid="popup" style={{ left: 100, top: 650 }} />;
    }

    const { getByTestId } = render(<Harness />);
    const popup = getByTestId("popup") as HTMLDivElement;

    expect(popup.style.top).toBe("588px");

    popupHeight = 180;
    act(() => {
      triggerResizeObserver?.();
    });

    expect(popup.style.top).toBe("508px");
    getBoundingClientRectSpy.mockRestore();
  });

  it("viewportのresize後もステータスバー領域を避ける", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });

    let statusBarTop = 776;
    const statusBar = document.createElement("footer");
    statusBar.className = "status-bar";
    statusBar.getBoundingClientRect = () =>
      ({ top: statusBarTop, bottom: 800, height: 24 }) as DOMRect;
    document.body.appendChild(statusBar);

    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function mockGetBoundingClientRect(this: HTMLElement) {
        if (this.classList.contains("status-bar")) {
          return { top: statusBarTop, bottom: window.innerHeight, height: 24 } as DOMRect;
        }
        if (this.dataset.testid === "popup") {
          const top = Number.parseFloat(this.style.top) || 650;
          return {
            left: 100,
            top,
            right: 300,
            bottom: top + 100,
            width: 200,
            height: 100,
          } as DOMRect;
        }
        return {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
        } as DOMRect;
      });

    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      useAdjustOverflow(ref, 8);

      return <div ref={ref} data-testid="popup" style={{ left: 100, top: 650 }} />;
    }

    const { getByTestId } = render(<Harness />);
    const popup = getByTestId("popup") as HTMLDivElement;

    expect(popup.style.top).toBe("650px");

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });
    statusBarTop = 696;
    fireEvent(window, new Event("resize"));

    expect(popup.style.top).toBe("588px");
    getBoundingClientRectSpy.mockRestore();
  });
});
