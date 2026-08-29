import { useState, type PointerEvent } from "react";
import { OverlayStage } from "src/features/comment-overlay/ui/OverlayStage";
import type { LiveEventBus } from "../live-session/events";
import { createLiveEventBus } from "../live-session/event-bus";
import { liveWindowPlatform, type OverlayResizeDirection } from "../platform/index";
import { OverlayControlBar } from "./OverlayControlBar";
import { useLiveOverlay } from "./use-live-overlay";
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

export interface OverlayAppProps {
  eventBus?: LiveEventBus;
}

export function OverlayApp({ eventBus: providedEventBus }: OverlayAppProps = {}) {
  const [defaultEventBus] = useState(createLiveEventBus);
  const eventBus = providedEventBus ?? defaultEventBus;
  const { comments, stageKey } = useLiveOverlay(eventBus);

  return (
    <main className="overlay-stage overlay-stage--controls-visible" data-testid="overlay-stage">
      <div className="overlay-stage__resize-frame" aria-hidden="true" />
      <OverlayStage
        key={stageKey}
        className="overlay-stage__comment-layer"
        comments={comments}
        stageWidth={900}
        stageHeight={160}
        laneHeight={32}
        fitToContainer
        playing
        interactive={false}
        showCommentInfo={false}
        backgroundColor="transparent"
      />
      <OverlayControlBar visible />
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
