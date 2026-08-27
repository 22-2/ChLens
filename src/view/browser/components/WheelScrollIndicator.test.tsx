import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { WheelScrollIndicator } from "src/view/browser/components/WheelScrollIndicator";
import "src/view/browser/styles/layout/ContentArea.css";
import { afterEach, describe, expect, it } from "vite-plus/test";

function IndicatorHarness({ direction }: { direction: "up" | "down" }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="content-area" data-testid="content-area">
      <div ref={scrollContainerRef} className="content-area__tab-panel">
        <WheelScrollIndicator
          direction={direction}
          count={1}
          threshold={7}
          portalContainerRef={scrollContainerRef}
        />
      </div>
    </div>
  );
}

describe("WheelScrollIndicator", () => {
  afterEach(() => {
    cleanup();
  });

  it.each(["up", "down"] as const)("%s方向をContentArea overlayとして表示する", (direction) => {
    render(<IndicatorHarness direction={direction} />);

    const contentArea = screen.getByTestId("content-area");
    const indicator = screen.getByRole("status");

    expect(indicator).toHaveClass("scroll-indicator", direction, "visible");
    expect(indicator.parentElement).toBe(contentArea);
    // Portal先がContentAreaであることが、各ペインの上下端でclipする境界を保証する。
    expect(contentArea).toHaveClass("content-area");
  });
});
