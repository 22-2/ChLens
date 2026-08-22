import type { MouseEvent, PointerEvent } from "react";
import { liveWindowPlatform } from "../platform/index";
import "./styles.css";

function startDragging(event: PointerEvent<HTMLElement>): void {
  if (event.button !== 0) return;

  event.preventDefault();
  void liveWindowPlatform.startDraggingOverlay().catch((error: unknown) => {
    console.error("[Chlens Live] overlay control bar dragging failed:", error);
  });
}

function stopBarControlEvent(
  event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>,
): void {
  event.stopPropagation();
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

export function OverlayControlsApp() {
  return (
    <main
      className="overlay-control-bar"
      onPointerDown={startDragging}
      onDoubleClick={toggleMaximize}
    >
      <span className="overlay-control-bar__title">Chlens Live Overlay</span>
      <div className="overlay-control-bar__actions" aria-label="Overlay window controls">
        <button
          type="button"
          className="overlay-control-bar__button"
          aria-label="最小化"
          title="最小化"
          onPointerDown={stopBarControlEvent}
          onDoubleClick={stopBarControlEvent}
          onClick={minimize}
        >
          −
        </button>
        <button
          type="button"
          className="overlay-control-bar__button"
          aria-label="最大化／元に戻す"
          title="最大化／元に戻す"
          onPointerDown={stopBarControlEvent}
          onDoubleClick={stopBarControlEvent}
          onClick={toggleMaximize}
        >
          □
        </button>
        <button
          type="button"
          className="overlay-control-bar__button overlay-control-bar__button--close"
          aria-label="閉じる"
          title="閉じる"
          onPointerDown={stopBarControlEvent}
          onDoubleClick={stopBarControlEvent}
          onClick={close}
        >
          ×
        </button>
      </div>
    </main>
  );
}
