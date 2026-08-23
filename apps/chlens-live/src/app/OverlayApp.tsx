import type { PointerEvent } from "react";
import { liveWindowPlatform, type OverlayResizeDirection } from "../platform/index";
import { OverlayControlBar } from "./OverlayControlBar";
import "./styles.css";

const RESIZE_HANDLES: ReadonlyArray<{
  direction: OverlayResizeDirection;
  className: string;
}> = [
  { direction: "NorthWest", className: "overlay-stage__resize-handle--north-west" },
  { direction: "North", className: "overlay-stage__resize-handle--north" },
  { direction: "NorthEast", className: "overlay-stage__resize-handle--north-east" },
  { direction: "East", className: "overlay-stage__resize-handle--east" },
  { direction: "SouthEast", className: "overlay-stage__resize-handle--south-east" },
  { direction: "South", className: "overlay-stage__resize-handle--south" },
  { direction: "SouthWest", className: "overlay-stage__resize-handle--south-west" },
  { direction: "West", className: "overlay-stage__resize-handle--west" },
];

function startResizing(
  event: PointerEvent<HTMLSpanElement>,
  direction: OverlayResizeDirection,
): void {
  if (event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();
  void liveWindowPlatform.startResizingOverlay(direction).catch((error: unknown) => {
    console.error(`[Chlens Live] overlay resizing failed: ${direction}`, error);
  });
}

export function OverlayApp() {
  return (
    <main className="overlay-stage" data-testid="overlay-stage">
      <OverlayControlBar />
      {RESIZE_HANDLES.map(({ direction, className }) => (
        <span
          key={direction}
          aria-hidden="true"
          className={`overlay-stage__resize-handle ${className}`}
          onPointerDown={(event) => startResizing(event, direction)}
        />
      ))}
    </main>
  );
}
