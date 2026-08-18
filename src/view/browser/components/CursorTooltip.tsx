import React, { useCallback, useState } from "react";

interface CursorTooltipState {
  label: string;
  x: number;
  y: number;
}

export function CursorTooltip({ label, x, y }: CursorTooltipState): React.ReactElement {
  return (
    <div className="cursor-tooltip" style={{ left: x + 16, top: y + 16 }} role="tooltip">
      {label}
    </div>
  );
}

export function useCursorTooltip() {
  const [tooltipState, setTooltipState] = useState<CursorTooltipState | null>(null);

  const show = useCallback((label: string, event: React.MouseEvent<HTMLElement>) => {
    setTooltipState({ label, x: event.clientX, y: event.clientY });
  }, []);

  const move = useCallback((label: string, event: React.MouseEvent<HTMLElement>) => {
    setTooltipState(() => ({
      label,
      x: event.clientX,
      y: event.clientY,
    }));
  }, []);

  const hide = useCallback(() => setTooltipState(null), []);

  return {
    show,
    move,
    hide,
    tooltip: tooltipState ? <CursorTooltip {...tooltipState} /> : null,
  };
}
