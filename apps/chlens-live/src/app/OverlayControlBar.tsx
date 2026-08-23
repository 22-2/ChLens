import { useEffect, useState, type MouseEvent, type PointerEvent } from "react";
import { liveWindowPlatform, type OverlayResizeDirection } from "../platform/index";
import "./styles.css";

const BAR_RESIZE_HANDLES: ReadonlyArray<{
  direction: OverlayResizeDirection;
  className: string;
}> = [
  { direction: "NorthWest", className: "overlay-control-bar__resize-handle--north-west" },
  { direction: "North", className: "overlay-control-bar__resize-handle--north" },
  { direction: "NorthEast", className: "overlay-control-bar__resize-handle--north-east" },
  { direction: "East", className: "overlay-control-bar__resize-handle--east" },
  { direction: "SouthEast", className: "overlay-control-bar__resize-handle--south-east" },
  { direction: "South", className: "overlay-control-bar__resize-handle--south" },
  { direction: "SouthWest", className: "overlay-control-bar__resize-handle--south-west" },
  { direction: "West", className: "overlay-control-bar__resize-handle--west" },
];

function stopBarControlEvent(
  event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>,
): void {
  event.stopPropagation();
}

function startResizing(
  event: PointerEvent<HTMLSpanElement>,
  direction: OverlayResizeDirection,
): void {
  if (event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();
  void liveWindowPlatform.startResizingOverlay(direction).catch((error: unknown) => {
    console.error(`[Chlens Live] overlay resizing from control bar failed: ${direction}`, error);
  });
}

function toggleMaximize(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
  void liveWindowPlatform.toggleMaximizeOverlay().catch((error: unknown) => {
    console.error("[Chlens Live] overlay maximize failed:", error);
  });
}

function minimize(event: MouseEvent<HTMLButtonElement>): void {
  stopBarControlEvent(event);
  void liveWindowPlatform.minimizeOverlay().catch((error: unknown) => {
    console.error("[Chlens Live] overlay minimize failed:", error);
  });
}

function close(event: MouseEvent<HTMLButtonElement>): void {
  stopBarControlEvent(event);
  void liveWindowPlatform.closeOverlay().catch((error: unknown) => {
    console.error("[Chlens Live] overlay close failed:", error);
  });
}

export function OverlayControlBar() {
  const [barVisibility, setBarVisibility] = useState({ hovered: true, hasHovered: false });

  useEffect(
    () =>
      liveWindowPlatform.trackOverlayBarHover((hovered) => {
        setBarVisibility((current) => {
          if (hovered) return { hovered: true, hasHovered: true };
          // Keep the startup locator visible until the pointer has actually visited the bar once.
          // A transparent overlay otherwise disappears before users can discover its position.
          return current.hasHovered ? { hovered: false, hasHovered: true } : current;
        });
      }),
    [],
  );

  return (
    <header
      className={`overlay-control-bar${barVisibility.hovered ? " overlay-control-bar--visible" : ""}`}
      data-overlay-interactive="true"
    >
      <div className="overlay-control-bar__status" role="status" aria-live="polite">
        <span className="overlay-control-bar__status-dot" aria-hidden="true" />
        <span className="overlay-control-bar__status-copy">
          <strong className="overlay-control-bar__title">Chlens Live</strong>
        </span>
      </div>
      <div className="overlay-control-bar__actions" aria-label="Overlay window controls">
        <button
          type="button"
          className="overlay-control-bar__button"
          aria-label="最小化"
          title="最小化"
          onPointerDown={stopBarControlEvent}
          onClick={minimize}
        >
          <span
            className="overlay-control-bar__glyph overlay-control-bar__glyph--minimize"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          className="overlay-control-bar__button"
          aria-label="最大化／元に戻す"
          title="最大化／元に戻す"
          onPointerDown={stopBarControlEvent}
          onClick={toggleMaximize}
        >
          <span
            className="overlay-control-bar__glyph overlay-control-bar__glyph--maximize"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          className="overlay-control-bar__button overlay-control-bar__button--close"
          aria-label="閉じる"
          title="閉じる"
          onPointerDown={stopBarControlEvent}
          onClick={close}
        >
          <span
            className="overlay-control-bar__glyph overlay-control-bar__glyph--close"
            aria-hidden="true"
          />
        </button>
      </div>
      {BAR_RESIZE_HANDLES.map(({ direction, className }) => (
        <span
          key={direction}
          aria-hidden="true"
          className={`overlay-control-bar__resize-handle ${className}`}
          onPointerDown={(event) => startResizing(event, direction)}
        />
      ))}
    </header>
  );
}
