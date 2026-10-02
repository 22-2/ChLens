import "src/view/browser/styles/components/WheelScrollIndicator.css";

import React, { memo, type RefObject, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "src/view/browser/ui/Spinner";

interface WheelScrollIndicatorProps {
  direction: "up" | "down" | null;
  count: number;
  threshold: number;
  isLoading?: boolean;
  portalContainerRef?: RefObject<HTMLElement | null>;
}

export const WheelScrollIndicator = memo(function WheelScrollIndicator({
  direction,
  count,
  threshold,
  isLoading = false,
  portalContainerRef,
}: WheelScrollIndicatorProps): React.ReactElement | null {
  // 変更理由: 連続更新を防ぐ待ち時間は通信中ではないため、
  // スピナーの表示期間は実際のロード状態だけに合わせる。
  const isBusy = isLoading;
  const shouldRender = Boolean(direction && (isBusy || count !== 0));
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!portalContainerRef || !shouldRender) return;

    // ContentAreaはスクロールパネルの外側にあるため、そこをoverlayのhostにする。
    // 先にrefから探し、テストや将来のDOM変更ではindicator自身からも解決できるようにする。
    const target = (portalContainerRef.current?.closest(".content-area") ??
      indicatorRef.current?.closest(".content-area")) as HTMLElement | null;
    setPortalTarget((previousTarget) => (previousTarget === target ? previousTarget : target));
  }, [portalContainerRef, shouldRender]);

  if (!shouldRender) return null;

  const progress = threshold > 0 ? Math.min(1, Math.max(0, count / threshold)) : 0;
  const indicator = (
    <div
      ref={indicatorRef}
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

  return portalContainerRef && portalTarget ? createPortal(indicator, portalTarget) : indicator;
});
