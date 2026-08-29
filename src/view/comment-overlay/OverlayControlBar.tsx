import type { MouseEvent, PointerEvent, ReactElement } from "react";
import { Minus, Square, X } from "lucide-react";
import {
  commentOverlayWindowPlatform,
  type CommentOverlayResizeDirection,
  type CommentOverlayWindowPlatform,
} from "src/features/comment-overlay/platform";

const BAR_RESIZE_HANDLES: ReadonlyArray<{
  direction: CommentOverlayResizeDirection;
  className: string;
}> = [
  { direction: "NorthWest", className: "comment-overlay-control-bar__resize--north-west" },
  { direction: "North", className: "comment-overlay-control-bar__resize--north" },
  { direction: "NorthEast", className: "comment-overlay-control-bar__resize--north-east" },
  { direction: "East", className: "comment-overlay-control-bar__resize--east" },
  { direction: "SouthEast", className: "comment-overlay-control-bar__resize--south-east" },
  { direction: "South", className: "comment-overlay-control-bar__resize--south" },
  { direction: "SouthWest", className: "comment-overlay-control-bar__resize--south-west" },
  { direction: "West", className: "comment-overlay-control-bar__resize--west" },
];

function stopControlEvent(
  event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>,
): void {
  event.stopPropagation();
}

function startResizing(
  event: PointerEvent<HTMLSpanElement>,
  direction: CommentOverlayResizeDirection,
  platform: CommentOverlayWindowPlatform,
): void {
  if (event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();
  void platform.startResizing(direction).catch((error: unknown) => {
    console.error(`[ChLens] コメントOverlayのリサイズに失敗しました: ${direction}`, error);
  });
}

function toggleMaximize(
  event: MouseEvent<HTMLElement>,
  platform: CommentOverlayWindowPlatform,
): void {
  event.preventDefault();
  event.stopPropagation();
  void platform.toggleMaximize().catch((error: unknown) => {
    console.error("[ChLens] コメントOverlayの最大化切り替えに失敗しました:", error);
  });
}

function minimize(
  event: MouseEvent<HTMLButtonElement>,
  platform: CommentOverlayWindowPlatform,
): void {
  stopControlEvent(event);
  void platform.minimize().catch((error: unknown) => {
    console.error("[ChLens] コメントOverlayの最小化に失敗しました:", error);
  });
}

function close(event: MouseEvent<HTMLButtonElement>, platform: CommentOverlayWindowPlatform): void {
  stopControlEvent(event);
  void platform.close().catch((error: unknown) => {
    console.error("[ChLens] コメントOverlayを閉じる操作に失敗しました:", error);
  });
}

export function OverlayControlBar({
  visible,
  platform = commentOverlayWindowPlatform,
}: {
  visible: boolean;
  platform?: CommentOverlayWindowPlatform;
}): ReactElement {
  return (
    <header
      className={`comment-overlay-control-bar${visible ? " comment-overlay-control-bar--visible" : ""}`}
      data-overlay-interactive="true"
    >
      <div className="comment-overlay-control-bar__status" role="status" aria-live="polite">
        <span className="comment-overlay-control-bar__status-dot" aria-hidden="true" />
        <strong className="comment-overlay-control-bar__title">ChLens</strong>
      </div>
      <div className="comment-overlay-control-bar__actions" aria-label="コメントOverlay操作">
        <button
          type="button"
          className="comment-overlay-control-bar__button"
          aria-label="最小化"
          title="最小化"
          onPointerDown={stopControlEvent}
          onClick={(event) => minimize(event, platform)}
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="comment-overlay-control-bar__button"
          aria-label="最大化／元に戻す"
          title="最大化／元に戻す"
          onPointerDown={stopControlEvent}
          onClick={(event) => toggleMaximize(event, platform)}
        >
          <Square size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="comment-overlay-control-bar__button comment-overlay-control-bar__button--close"
          aria-label="閉じる"
          title="閉じる"
          onPointerDown={stopControlEvent}
          onClick={(event) => close(event, platform)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {BAR_RESIZE_HANDLES.map(({ direction, className }) => (
        <span
          key={direction}
          aria-hidden="true"
          className={`comment-overlay-control-bar__resize ${className}`}
          onPointerDown={(event) => startResizing(event, direction, platform)}
        />
      ))}
    </header>
  );
}
