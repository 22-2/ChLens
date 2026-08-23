import React, { memo } from "react";
import "src/view/browser/styles/components/WheelScrollIndicator.css";
import { Spinner } from "src/view/browser/ui/Spinner";

interface WheelScrollIndicatorProps {
  direction: "up" | "down" | null;
  count: number;
  threshold: number;
  isCoolingDown?: boolean;
  isLoading?: boolean;
}

export const WheelScrollIndicator = memo(function WheelScrollIndicator({
  direction,
  count,
  threshold,
  isCoolingDown = false,
  isLoading = false,
}: WheelScrollIndicatorProps): React.ReactElement | null {
  const isBusy = isLoading || isCoolingDown;
  if (!direction || (!isBusy && count === 0)) return null;

  return (
    <div
      className={`scroll-indicator ${direction} visible${isBusy ? " loading" : ""}`}
      role="status"
      aria-live="polite"
    >
      {isBusy ? (
        <Spinner size="xs" aria-label="ホイール更新中" />
      ) : (
        <>
          {direction === "up" ? "↑" : "↓"} あと {Math.max(0, threshold - count)}
        </>
      )}
    </div>
  );
});
