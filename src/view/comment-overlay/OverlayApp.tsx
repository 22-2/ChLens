import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  constrainCommentOverlayGeometryToAspectRatio,
  createCommentOverlayEventBus,
  COMMENT_OVERLAY_CONTROL_BAR_HEIGHT,
  DEFAULT_COMMENT_OVERLAY_GEOMETRY,
  type CommentOverlayEvent,
  type CommentOverlayEventBus,
  commentOverlayWindowPlatform,
  type CommentOverlayGeometry,
  type CommentOverlayResizeDirection,
  type CommentOverlayWindowPlatform,
} from "src/features/comment-overlay/platform";
import {
  DEFAULT_COMMENT_OVERLAY_SETTINGS,
  normalizeCommentOverlaySettings,
  type CommentCandidate,
  type CommentOverlaySettings,
  calculateNaturalCommentFlowCount,
  calculateNaturalCommentFlowInterval,
} from "src/features/comment-overlay/domain";
import {
  DEFAULT_COMMENT_HISTORY_LIMIT,
  OverlayStage,
  calculateCommentLaneHeight,
} from "src/features/comment-overlay/ui/OverlayStage";
import { OverlayControlBar } from "./OverlayControlBar";

const MAX_COMMENT_HISTORY = DEFAULT_COMMENT_HISTORY_LIMIT;

const RESIZE_HANDLES: ReadonlyArray<{
  direction: CommentOverlayResizeDirection;
  className: string;
}> = [
  { direction: "NorthWest", className: "comment-overlay-window__resize--north-west" },
  { direction: "North", className: "comment-overlay-window__resize--north" },
  { direction: "NorthEast", className: "comment-overlay-window__resize--north-east" },
  { direction: "East", className: "comment-overlay-window__resize--east" },
  { direction: "SouthEast", className: "comment-overlay-window__resize--south-east" },
  { direction: "South", className: "comment-overlay-window__resize--south" },
  { direction: "SouthWest", className: "comment-overlay-window__resize--south-west" },
  { direction: "West", className: "comment-overlay-window__resize--west" },
];

export interface OverlayAppProps {
  eventBus?: CommentOverlayEventBus;
  platform?: CommentOverlayWindowPlatform;
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

/** Tauriのnative windowと、Storybookでも検証できるOverlayStageを接続する。 */
export function OverlayApp({
  eventBus: providedEventBus,
  platform = commentOverlayWindowPlatform,
}: OverlayAppProps = {}) {
  const [defaultEventBus] = useState(createCommentOverlayEventBus);
  const eventBus = providedEventBus ?? defaultEventBus;
  const [comments, setComments] = useState<readonly CommentCandidate[]>([]);
  const [stageKey, setStageKey] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settings, setSettings] = useState<CommentOverlaySettings>(() => ({
    ...DEFAULT_COMMENT_OVERLAY_SETTINGS,
  }));
  const activeThreadUrlRef = useRef<string | null>(null);
  const seenResponseNumbersRef = useRef(new Set<number>());
  const seenResponseOrderRef = useRef<number[]>([]);
  const latestGeometryRef = useRef<CommentOverlayGeometry>(DEFAULT_COMMENT_OVERLAY_GEOMETRY);
  const resizeSessionRef = useRef<{
    direction: CommentOverlayResizeDirection;
    origin: CommentOverlayGeometry;
  } | null>(null);
  const resizeSessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    let flowTimer: ReturnType<typeof setTimeout> | null = null;
    const commentQueue: CommentCandidate[] = [];
    let currentBatchSize = 0;

    const handleEvent = (event: CommentOverlayEvent): void => {
      if (event.type === "settings") {
        // 設定更新では既存コメントを消さず、実行中の速度・文字サイズだけを次の描画へ反映する。
        setSettings(normalizeCommentOverlaySettings(event.settings));
        return;
      }

      const { batch } = event;
      if (event.type === "reset" || activeThreadUrlRef.current !== batch.threadUrl) {
        // 変更理由: スレが変わった時に前スレのlane・レス番号を再利用すると、別スレの
        // コメントが混ざるため、表示履歴と重複判定を同時に初期化する。resetは同じ
        // スレッドの実況を再開した場合にもこの境界を明示的に通過させる。
        activeThreadUrlRef.current = batch.threadUrl;
        seenResponseNumbersRef.current.clear();
        seenResponseOrderRef.current = [];
        if (flowTimer) clearTimeout(flowTimer);
        flowTimer = null;
        commentQueue.length = 0;
        setComments([]);
        setStageKey((current) => current + 1);
        if (event.type === "reset") {
          // 設定は実況開始時にだけ反映し、表示中のコメントを毎batch再配置しない。
          setSettings(normalizeCommentOverlaySettings(event.settings));
        }
      }

      const additions = batch.comments.filter((comment) => {
        if (seenResponseNumbersRef.current.has(comment.responseNumber)) return false;
        seenResponseNumbersRef.current.add(comment.responseNumber);
        seenResponseOrderRef.current.push(comment.responseNumber);
        return true;
      });
      if (additions.length === 0) return;

      while (seenResponseOrderRef.current.length > MAX_COMMENT_HISTORY) {
        const expiredResponseNumber = seenResponseOrderRef.current.shift();
        if (expiredResponseNumber !== undefined) {
          seenResponseNumbersRef.current.delete(expiredResponseNumber);
        }
      }

      const queueWasEmpty = commentQueue.length === 0;
      currentBatchSize = additions.length;
      commentQueue.push(...additions);
      if (queueWasEmpty && commentQueue.length > 0) {
        // 変更理由: 最初の新着だけは即時に反映し、残りは取得バッチを人為的な
        // 等間隔に見せない揺らぎ付きで投入して実況らしい流れを保つ。
        setComments((current) => {
          const next = [...current, ...commentQueue.splice(0, 1)];
          return next.length > MAX_COMMENT_HISTORY ? next.slice(-MAX_COMMENT_HISTORY) : next;
        });
      }

      const scheduleNextComment = (): void => {
        if (commentQueue.length === 0 || flowTimer) return;
        const interval = calculateNaturalCommentFlowInterval({
          queueSize: commentQueue.length,
          batchSize: currentBatchSize,
          updateIntervalMilliseconds: 10_000,
        });
        flowTimer = setTimeout(() => {
          flowTimer = null;
          const count = calculateNaturalCommentFlowCount(commentQueue.length);
          setComments((current) => {
            const next = [...current, ...commentQueue.splice(0, count)];
            return next.length > MAX_COMMENT_HISTORY ? next.slice(-MAX_COMMENT_HISTORY) : next;
          });
          scheduleNextComment();
        }, interval);
      };
      scheduleNextComment();
    };

    void eventBus
      .subscribe(handleEvent)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      })
      .catch((error: unknown) => {
        console.error("[ChLens] コメントOverlay eventの購読に失敗しました:", error);
      });

    return () => {
      disposed = true;
      if (flowTimer) clearTimeout(flowTimer);
      flowTimer = null;
      commentQueue.length = 0;
      unsubscribe?.();
    };
  }, [eventBus]);

  useEffect(() => {
    void platform.setClickThrough(true).catch((error: unknown) => {
      console.error("[ChLens] コメントOverlayの初期クリック透過設定に失敗しました:", error);
    });

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let aspectTimer: ReturnType<typeof setTimeout> | null = null;
    let unwatchGeometry: (() => void) | null = null;
    let unwatchVisibility: (() => void) | null = null;
    let disposed = false;
    void platform
      .loadGeometry()
      .then(async (geometry) => {
        if (geometry) {
          latestGeometryRef.current = geometry;
          return;
        }
        // 変更理由: loadGeometryとgetGeometryを並行実行すると、保存値の復元後に
        // 古いnativeサイズが到着してリサイズ起点を巻き戻すため、復元完了後だけ現在値を読む。
        const currentGeometry = await platform.getGeometry();
        if (!disposed && currentGeometry) latestGeometryRef.current = currentGeometry;
      })
      .catch((error: unknown) => {
        console.error("[ChLens] コメントOverlayのgeometry復元に失敗しました:", error);
      });
    void platform
      .watchGeometry((geometry: CommentOverlayGeometry) => {
        latestGeometryRef.current = geometry;
        const resizeSession = resizeSessionRef.current;
        if (resizeSession) {
          const sizeChanged =
            Math.abs(geometry.width - resizeSession.origin.width) > 1 ||
            Math.abs(geometry.height - resizeSession.origin.height) > 1;
          if (sizeChanged) {
            if (resizeSessionTimeoutRef.current) {
              clearTimeout(resizeSessionTimeoutRef.current);
              resizeSessionTimeoutRef.current = null;
            }
            if (aspectTimer) clearTimeout(aspectTimer);
            aspectTimer = setTimeout(() => {
              aspectTimer = null;
              if (resizeSessionRef.current !== resizeSession) return;
              resizeSessionRef.current = null;
              if (resizeSessionTimeoutRef.current) {
                clearTimeout(resizeSessionTimeoutRef.current);
                resizeSessionTimeoutRef.current = null;
              }
              const constrained = constrainCommentOverlayGeometryToAspectRatio(
                resizeSession.origin,
                latestGeometryRef.current,
                resizeSession.direction,
              );
              latestGeometryRef.current = constrained;
              void platform.setGeometry(constrained).catch((error: unknown) => {
                console.error("[ChLens] コメントOverlayの縦横比補正に失敗しました:", error);
              });
            }, 120);
          }
        }
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveTimer = null;
          void platform.saveGeometry(geometry).catch((error: unknown) => {
            console.error("[ChLens] コメントOverlayのgeometry自動保存に失敗しました:", error);
          });
        }, 250);
      })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unwatchGeometry = cleanup;
      })
      .catch((error: unknown) => {
        console.error("[ChLens] コメントOverlayのgeometry監視開始に失敗しました:", error);
      });

    void platform
      .watchVisibility(() => {})
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unwatchVisibility = cleanup;
      })
      .catch((error: unknown) => {
        console.error("[ChLens] コメントOverlayの表示状態監視開始に失敗しました:", error);
      });

    const untrackBarHover = platform.trackBarHover(setControlsVisible);
    return () => {
      disposed = true;
      if (saveTimer) clearTimeout(saveTimer);
      if (aspectTimer) clearTimeout(aspectTimer);
      if (resizeSessionTimeoutRef.current) clearTimeout(resizeSessionTimeoutRef.current);
      resizeSessionTimeoutRef.current = null;
      resizeSessionRef.current = null;
      unwatchGeometry?.();
      unwatchVisibility?.();
      untrackBarHover();
    };
  }, [platform]);

  const beginResize = (
    event: PointerEvent<HTMLSpanElement>,
    direction: CommentOverlayResizeDirection,
  ): void => {
    // 変更理由: Tauriのネイティブリサイズ終了後に開始時の縦横比へ戻し、
    // フォント・行間・移動距離をEdgeLiveViewerと同じ倍率で揃える。
    resizeSessionRef.current = { direction, origin: { ...latestGeometryRef.current } };
    if (resizeSessionTimeoutRef.current) clearTimeout(resizeSessionTimeoutRef.current);
    // 変更理由: OS側のリサイズeventを取りこぼしても、次のhoverや移動eventを
    // 直前のリサイズとして誤解釈して再拡大しないよう、未完了セッションを短時間で破棄する。
    resizeSessionTimeoutRef.current = setTimeout(() => {
      resizeSessionTimeoutRef.current = null;
      resizeSessionRef.current = null;
    }, 2_000);
    startResizing(event, direction, platform);
  };

  return (
    <main className="comment-overlay-window" data-testid="comment-overlay-window">
      <div className="comment-overlay-window__frame" aria-hidden="true" />
      <OverlayStage
        key={stageKey}
        className="comment-overlay-window__comment-layer"
        comments={comments}
        stageWidth={DEFAULT_COMMENT_OVERLAY_GEOMETRY.width}
        stageHeight={DEFAULT_COMMENT_OVERLAY_GEOMETRY.height}
        durationSeconds={settings.durationSeconds}
        topPadding={COMMENT_OVERLAY_CONTROL_BAR_HEIGHT + 4}
        laneHeight={calculateCommentLaneHeight(settings.fontSize)}
        fontSize={settings.fontSize}
        commentOpacity={settings.opacity}
        maxQueueSize={settings.maxQueueSize}
        // 変更理由: Tauriの横長・低い初期Overlayではadaptiveの循環laneが同時に
        // 同じ行へ入るため、実機では文字が重なる。実況の遅延より重なり防止を優先し、
        // 空きlaneができるまでqueueで待たせる。
        collisionMode="strict"
        backlogPolicy={settings.maxQueueSize > 0 ? "queue" : "drop"}
        fitToContainer
        scaleToContainer
        scaleReferenceWidth={DEFAULT_COMMENT_OVERLAY_GEOMETRY.width}
        scaleReferenceHeight={DEFAULT_COMMENT_OVERLAY_GEOMETRY.height}
        playing
        interactive={false}
        showCommentInfo={false}
        backgroundColor="transparent"
      />
      <OverlayControlBar
        visible={controlsVisible}
        platform={platform}
        onResizeStart={beginResize}
      />
      {RESIZE_HANDLES.map(({ direction, className }) => (
        <span
          key={direction}
          aria-hidden="true"
          className={`comment-overlay-window__resize ${className}`}
          onPointerDown={(event) => beginResize(event, direction)}
        />
      ))}
    </main>
  );
}
