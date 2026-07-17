import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { useThreadTopScrollOpenFilter } from "src/view/browser/pages/thread/use-thread-top-scroll-open-filter";

function WheelFilterHarness({ isActive = true }: { isActive?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeTopBar, setActiveTopBar] = useState<"none" | "filter">("none");
  const [openCount, setOpenCount] = useState(0);
  const openFilterToolbar = () => {
    setOpenCount((prev) => prev + 1);
    setActiveTopBar("filter");
  };

  useThreadTopScrollOpenFilter({
    activeTopBar,
    isActive,
    openFilterToolbar,
    rootRef,
  });

  return (
    <div data-testid="scroll-container" className="content-area__tab-panel">
      <div ref={rootRef} className="thread-page">
        <output data-testid="active-top-bar">{activeTopBar}</output>
        <output data-testid="open-count">{openCount}</output>
        <div style={{ height: 200 }}>body</div>
      </div>
    </div>
  );
}

describe("useThreadTopScrollOpenFilter", () => {
  afterEach(() => {
    cleanup();
  });

  it("スレ最上部で上方向へホイールするとフィルタバーを開く", () => {
    render(<WheelFilterHarness />);

    const scrollContainer = screen.getByTestId(
      "scroll-container",
    ) as HTMLDivElement;
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 0,
    });

    fireEvent.wheel(scrollContainer, { deltaY: -48 });

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("filter");
    expect(screen.getByTestId("open-count")).toHaveTextContent("1");
  });

  it("まだ上端に達していない時はフィルタバーを開かない", () => {
    render(<WheelFilterHarness />);

    const scrollContainer = screen.getByTestId(
      "scroll-container",
    ) as HTMLDivElement;
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 24,
    });

    fireEvent.wheel(scrollContainer, { deltaY: -48 });

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
    expect(screen.getByTestId("open-count")).toHaveTextContent("0");
  });

  it("Ctrl+wheel のズーム操作ではフィルタバーを開かない", () => {
    render(<WheelFilterHarness />);

    const scrollContainer = screen.getByTestId(
      "scroll-container",
    ) as HTMLDivElement;
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 0,
    });

    fireEvent.wheel(scrollContainer, { ctrlKey: true, deltaY: -48 });

    expect(screen.getByTestId("active-top-bar")).toHaveTextContent("none");
    expect(screen.getByTestId("open-count")).toHaveTextContent("0");
  });
});
