import type { PointerEvent } from "react";
import { liveWindowPlatform } from "../platform/index";
import "./styles.css";

function startDragging(event: PointerEvent<HTMLElement>): void {
  if (event.button !== 0) return;

  event.preventDefault();
  void liveWindowPlatform.startDraggingOverlay().catch((error: unknown) => {
    console.error("[Chlens Live] overlay control bar dragging failed:", error);
  });
}

export function OverlayControlsApp() {
  return (
    <main className="overlay-control-bar" onPointerDown={startDragging}>
      <span className="overlay-control-bar__title">Chlens Live Overlay</span>
    </main>
  );
}
