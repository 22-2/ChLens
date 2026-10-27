import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

const CURSOR_OFFSET = 16;

interface CursorTooltipState {
  label: string;
  x: number;
  y: number;
}

interface CursorTooltipProps extends CursorTooltipState {
  abovePopups?: boolean;
}

export function CursorTooltip({
  label,
  x,
  y,
  abovePopups = false,
}: CursorTooltipProps): React.ReactElement {
  const { document: viewDocument } = useViewSurface();
  // 変更理由: タブ一覧や表のスクロール領域によるクリッピングを避け、
  // 隣の要素にも重ねられるよう、表示中の窓のルートへ描画する。
  const portalContainer =
    viewDocument.querySelector<HTMLElement>(".browser-shell") ?? viewDocument.body;

  const tooltipRef = useRef<HTMLDivElement>(null);

  // 変更理由: position: fixed の要素は右端の余白が足りないと幅が縮み、
  // 画面端のカラムでは日時などが折り返されて潰れて見える。
  // 実寸を測り、はみ出す側ではカーソルの反対側へ反転して表示する。
  useLayoutEffect(() => {
    const element = tooltipRef.current;
    if (!element) return;
    const viewport = viewDocument.documentElement;
    // 縮んだ幅ではなく本来の幅で判定するため、左上へ寄せて余白を確保してから測る。
    element.style.left = "0px";
    element.style.top = "0px";
    const { width, height } = element.getBoundingClientRect();
    let left = x + CURSOR_OFFSET;
    let top = y + CURSOR_OFFSET;
    // レイアウトを持たない環境（寸法が 0）では反転しない。
    if (viewport.clientWidth > 0 && left + width > viewport.clientWidth) {
      left = x - CURSOR_OFFSET - width;
    }
    if (viewport.clientHeight > 0 && top + height > viewport.clientHeight) {
      top = y - CURSOR_OFFSET - height;
    }
    // 測定で書き換えた位置を、描画前に確定した値で上書きする。
    element.style.left = `${Math.max(0, left)}px`;
    element.style.top = `${Math.max(0, top)}px`;
  }, [label, x, y, viewDocument]);

  return createPortal(
    <div
      ref={tooltipRef}
      className={`cursor-tooltip${abovePopups ? " cursor-tooltip--above-popups" : ""}`}
      role="tooltip"
    >
      {label}
    </div>,
    portalContainer,
  );
}

export function useCursorTooltip({ abovePopups = false }: { abovePopups?: boolean } = {}) {
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
    tooltip: tooltipState ? <CursorTooltip {...tooltipState} abovePopups={abovePopups} /> : null,
  };
}
