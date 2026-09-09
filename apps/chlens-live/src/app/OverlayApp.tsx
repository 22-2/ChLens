import { useEffect, useRef, useState, type PointerEvent } from "react";
import { OverlayStage } from "src/features/comment-overlay/ui/OverlayStage";
import type { LiveEventBus } from "../live-session/events";
import { createLiveEventBus } from "../live-session/event-bus";
import {
  constrainOverlayGeometryToAspectRatio,
  DEFAULT_OVERLAY_GEOMETRY,
  liveWindowPlatform,
  type OverlayGeometry,
  type OverlayResizeDirection,
} from "../platform/index";
import { OverlayControlBar } from "./OverlayControlBar";
import {
  calculateEdgeLiveViewerLaneHeight,
  DEFAULT_EDGE_LIVE_VIEWER_SETTINGS,
} from "./overlay-settings";
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
  const latestGeometryRef = useRef<OverlayGeometry>(DEFAULT_OVERLAY_GEOMETRY);
  const resizeSessionRef = useRef<{
    direction: OverlayResizeDirection;
    origin: OverlayGeometry;
  } | null>(null);
  const resizeSessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 変更理由: Storyと実アプリで別の固定値を使うと、Tauriだけ文字が小さくなり、
  // Windowsのフォント描画ではlane高も不足するため、EdgeLiveViewerの既定値へ統一する。
  const settings = DEFAULT_EDGE_LIVE_VIEWER_SETTINGS;

  useEffect(() => {
    let disposed = false;
    let unwatch: (() => void) | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    void liveWindowPlatform
      .getOverlayGeometry()
      .then((geometry) => {
        if (!disposed && geometry) latestGeometryRef.current = geometry;
      })
      .catch((error: unknown) => {
        console.error("[Chlens Live] overlay初期geometryの読み込みに失敗しました:", error);
      });
    void liveWindowPlatform
      .watchOverlayGeometry((geometry) => {
        latestGeometryRef.current = geometry;
        const resizeSession = resizeSessionRef.current;
        if (!resizeSession) return;
        const sizeChanged =
          Math.abs(geometry.width - resizeSession.origin.width) > 1 ||
          Math.abs(geometry.height - resizeSession.origin.height) > 1;
        if (!sizeChanged) return;
        if (resizeSessionTimeoutRef.current) {
          clearTimeout(resizeSessionTimeoutRef.current);
          resizeSessionTimeoutRef.current = null;
        }
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          settleTimer = null;
          if (resizeSessionRef.current !== resizeSession) return;
          resizeSessionRef.current = null;
          if (resizeSessionTimeoutRef.current) {
            clearTimeout(resizeSessionTimeoutRef.current);
            resizeSessionTimeoutRef.current = null;
          }
          const constrained = constrainOverlayGeometryToAspectRatio(
            resizeSession.origin,
            latestGeometryRef.current,
            resizeSession.direction,
          );
          latestGeometryRef.current = constrained;
          void liveWindowPlatform.setOverlayGeometry(constrained).catch((error: unknown) => {
            console.error("[Chlens Live] overlayの縦横比補正に失敗しました:", error);
          });
        }, 120);
      })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unwatch = cleanup;
      })
      .catch((error: unknown) => {
        console.error("[Chlens Live] overlayのgeometry監視開始に失敗しました:", error);
      });

    return () => {
      disposed = true;
      if (settleTimer) clearTimeout(settleTimer);
      if (resizeSessionTimeoutRef.current) clearTimeout(resizeSessionTimeoutRef.current);
      resizeSessionTimeoutRef.current = null;
      resizeSessionRef.current = null;
      unwatch?.();
    };
  }, []);

  const beginResize = (
    event: PointerEvent<HTMLSpanElement>,
    direction: OverlayResizeDirection,
  ): void => {
    // 変更理由: Tauriのネイティブリサイズ終了後に開始時の縦横比へ戻し、
    // EdgeLiveViewerと同じくフォントを含む表示全体を一様な倍率で変更する。
    resizeSessionRef.current = { direction, origin: { ...latestGeometryRef.current } };
    if (resizeSessionTimeoutRef.current) clearTimeout(resizeSessionTimeoutRef.current);
    // 変更理由: OS側のリサイズeventを取りこぼしても、次のhoverや移動eventを
    // 直前のリサイズとして誤解釈して再拡大しないよう、未完了セッションを短時間で破棄する。
    resizeSessionTimeoutRef.current = setTimeout(() => {
      resizeSessionTimeoutRef.current = null;
      resizeSessionRef.current = null;
    }, 2_000);
    startResizing(event, direction);
  };

  return (
    <main className="overlay-stage overlay-stage--controls-visible" data-testid="overlay-stage">
      <div className="overlay-stage__resize-frame" aria-hidden="true" />
      <OverlayStage
        key={stageKey}
        className="overlay-stage__comment-layer"
        comments={comments}
        stageWidth={DEFAULT_OVERLAY_GEOMETRY.width}
        stageHeight={DEFAULT_OVERLAY_GEOMETRY.height}
        laneHeight={calculateEdgeLiveViewerLaneHeight(settings.spacing)}
        maxActiveCount={settings.maxComments}
        maxQueueSize={settings.maxComments}
        durationSeconds={settings.durationSeconds}
        fontFamily={settings.fontFamily}
        fontWeight={settings.fontWeight}
        fontColor={settings.fontColor}
        shadowSize={settings.shadowSize}
        shadowColor={settings.shadowColor}
        shadowDirections={settings.shadowDirections}
        commentOpacity={settings.opacity}
        // 変更理由: 実機の小さいOverlayでadaptiveのfallbackを使うと、取得batchの
        // 同時投入が同じ行へ集中するため、空きlaneまでqueueして重なりを防止する。
        collisionMode="strict"
        backlogPolicy="queue"
        fitToContainer
        scaleToContainer
        scaleReferenceWidth={DEFAULT_OVERLAY_GEOMETRY.width}
        scaleReferenceHeight={DEFAULT_OVERLAY_GEOMETRY.height}
        playing
        interactive={false}
        showCommentInfo={false}
        backgroundColor="transparent"
      />
      <OverlayControlBar
        visible
        onResizeStart={(event, direction) => beginResize(event, direction)}
      />
      {RESIZE_HANDLES.map(({ direction, className }) => (
        <span
          key={direction}
          aria-hidden="true"
          className={`overlay-stage__resize-handle ${className}`}
          onPointerDown={(event) => beginResize(event, direction)}
        />
      ))}
    </main>
  );
}
