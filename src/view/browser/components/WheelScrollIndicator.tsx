import React, { memo, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import "src/view/browser/styles/components/WheelScrollIndicator.css";

interface WheelScrollIndicatorProps {
  direction: "up" | "down" | null;
  count: number;
  threshold: number;
  portalContainerRef?: RefObject<HTMLElement | null>;
}

export const WheelScrollIndicator = memo(function WheelScrollIndicator({
  direction,
  count,
  threshold,
  portalContainerRef,
}: WheelScrollIndicatorProps): React.ReactElement | null {
  const shouldRender = direction !== null && count !== 0;
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!portalContainerRef || !shouldRender) return;

    // ContentArea はスクロールパネルの外側にあるため、そこをoverlayのhostにする。
    // 先にrefから探し、テストや将来のDOM変更ではindicator自身からも解決できるようにする。
    const target = (portalContainerRef.current?.closest(".content-area") ??
      indicatorRef.current?.closest(".content-area")) as HTMLElement | null;
    setPortalTarget((previousTarget) => (previousTarget === target ? previousTarget : target));
  }, [portalContainerRef, shouldRender]);

  if (!shouldRender) return null;

  const indicator = (
    <div
      ref={indicatorRef}
      className={`scroll-indicator ${direction} visible`}
      role="status"
      aria-live="polite"
    >
      {direction === "up" ? "↑" : "↓"} あと {Math.max(0, threshold - count)}
    </div>
  );

  return portalContainerRef && portalTarget ? createPortal(indicator, portalTarget) : indicator;
});
