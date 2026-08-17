import React, { memo } from "react";
import "src/view/browser/styles/components/WheelScrollIndicator.css";

interface WheelScrollIndicatorProps {
  direction: "up" | "down" | null;
  count: number;
  threshold: number;
}

export const WheelScrollIndicator = memo(function WheelScrollIndicator({
  direction,
  count,
  threshold,
}: WheelScrollIndicatorProps): React.ReactElement | null {
  if (!direction || count === 0) return null;

  return (
    <div className={`scroll-indicator ${direction} visible`} role="status" aria-live="polite">
      {direction === "up" ? "↑" : "↓"} あと {Math.max(0, threshold - count)}
    </div>
  );
});
