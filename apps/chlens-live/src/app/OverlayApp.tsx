import { useEffect, useState } from "react";
import { OverlayStage } from "src/features/comment-overlay/ui/OverlayStage";
import type { LiveEventBus } from "../live-session/events";
import { createLiveEventBus } from "../live-session/event-bus";
import {
  DEFAULT_OVERLAY_GEOMETRY,
  liveWindowPlatform,
  type OverlayGeometry,
} from "../platform/index";
import {
  calculateEdgeLiveViewerLaneHeight,
  DEFAULT_EDGE_LIVE_VIEWER_SETTINGS,
} from "./overlay-settings";
import { useLiveOverlay } from "./use-live-overlay";
import "./styles.css";

export interface OverlayAppProps {
  eventBus?: LiveEventBus;
}

export function OverlayApp({ eventBus: providedEventBus }: OverlayAppProps = {}) {
  const [defaultEventBus] = useState(createLiveEventBus);
  const eventBus = providedEventBus ?? defaultEventBus;
  const { comments, stageKey } = useLiveOverlay(eventBus);
  const [overlayGeometry, setOverlayGeometry] = useState<OverlayGeometry>(DEFAULT_OVERLAY_GEOMETRY);
  // 変更理由: Storyと実アプリで別の固定値を使うと、Tauriだけ文字が小さくなり、
  // Windowsのフォント描画ではlane高も不足するため、EdgeLiveViewerの既定値へ統一する。
  const settings = DEFAULT_EDGE_LIVE_VIEWER_SETTINGS;

  useEffect(() => {
    let disposed = false;
    let unwatch: (() => void) | null = null;
    void liveWindowPlatform
      .getOverlayGeometry()
      .then((geometry) => {
        if (!disposed && geometry) {
          setOverlayGeometry(geometry);
        }
      })
      .catch((error: unknown) => {
        console.error("[Chlens Live] overlay初期geometryの読み込みに失敗しました:", error);
      });
    void liveWindowPlatform
      .watchOverlayGeometry((geometry) => {
        if (disposed) return;
        // 位置変更だけではStageを再描画せず、コメントのCSSアニメーションを維持する。
        setOverlayGeometry((current) =>
          current.width === geometry.width && current.height === geometry.height
            ? current
            : geometry,
        );
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
      unwatch?.();
    };
  }, []);

  return (
    <main className="overlay-stage" data-testid="overlay-stage">
      <OverlayStage
        key={stageKey}
        className="overlay-stage__comment-layer"
        comments={comments}
        stageWidth={DEFAULT_OVERLAY_GEOMETRY.width}
        stageHeight={DEFAULT_OVERLAY_GEOMETRY.height}
        containerWidth={overlayGeometry.width}
        containerHeight={overlayGeometry.height}
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
        scaleToContainer
        scaleReferenceWidth={DEFAULT_OVERLAY_GEOMETRY.width}
        scaleReferenceHeight={DEFAULT_OVERLAY_GEOMETRY.height}
        playing
        interactive={false}
        showCommentInfo={false}
        backgroundColor="transparent"
      />
    </main>
  );
}
