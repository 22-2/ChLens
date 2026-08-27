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
  const progress = threshold > 0 ? Math.min(1, Math.max(0, count / threshold)) : 0;

  return (
    <div
      className={`scroll-indicator ${direction} visible${isBusy ? " loading" : ""}`}
      role="status"
      aria-live="polite"
    >
      {isBusy ? (
        <Spinner size="xs" aria-label="ホイール更新中" />
      ) : (
        <div
          className="scroll-indicator-track"
          role="progressbar"
          aria-label={`${direction === "up" ? "上" : "下"}方向の更新進捗`}
          aria-valuemin={0}
          aria-valuemax={threshold}
          aria-valuenow={count}
        >
          <span className="scroll-indicator-progress" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
});
