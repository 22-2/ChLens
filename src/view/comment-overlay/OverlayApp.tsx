import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  createCommentOverlayEventBus,
  type CommentOverlayEvent,
  type CommentOverlayEventBus,
  commentOverlayWindowPlatform,
  type CommentOverlayGeometry,
  type CommentOverlayResizeDirection,
  type CommentOverlayWindowPlatform,
} from "src/features/comment-overlay/platform";
import type { CommentCandidate } from "src/features/comment-overlay/domain";
import { OverlayStage } from "src/features/comment-overlay/ui/OverlayStage";
import { OverlayControlBar } from "./OverlayControlBar";

const MAX_COMMENT_HISTORY = 3_000;

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
  const activeThreadUrlRef = useRef<string | null>(null);
  const seenResponseNumbersRef = useRef(new Set<number>());

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    const handleEvent = (event: CommentOverlayEvent): void => {
      const { batch } = event;
      if (activeThreadUrlRef.current !== batch.threadUrl) {
        // 変更理由: スレが変わった時に前スレのlane・レス番号を再利用すると、別スレの
        // コメントが混ざるため、表示履歴と重複判定を同時に初期化する。
        activeThreadUrlRef.current = batch.threadUrl;
        seenResponseNumbersRef.current.clear();
        setComments([]);
        setStageKey((current) => current + 1);
      }

      const additions = batch.comments.filter((comment) => {
        if (seenResponseNumbersRef.current.has(comment.responseNumber)) return false;
        seenResponseNumbersRef.current.add(comment.responseNumber);
        return true;
      });
      if (additions.length === 0) return;

      setComments((current) => {
        const next = [...current, ...additions];
        return next.length > MAX_COMMENT_HISTORY ? next.slice(-MAX_COMMENT_HISTORY) : next;
      });
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
      unsubscribe?.();
    };
  }, [eventBus]);

  useEffect(() => {
    void platform.setClickThrough(true).catch((error: unknown) => {
      console.error("[ChLens] コメントOverlayの初期クリック透過設定に失敗しました:", error);
    });

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let unwatchGeometry: (() => void) | null = null;
    void platform.loadGeometry().catch((error: unknown) => {
      console.error("[ChLens] コメントOverlayのgeometry復元に失敗しました:", error);
    });
    void platform
      .watchGeometry((geometry: CommentOverlayGeometry) => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveTimer = null;
          void platform.saveGeometry(geometry).catch((error: unknown) => {
            console.error("[ChLens] コメントOverlayのgeometry自動保存に失敗しました:", error);
          });
        }, 250);
      })
      .then((cleanup) => {
        unwatchGeometry = cleanup;
      })
      .catch((error: unknown) => {
        console.error("[ChLens] コメントOverlayのgeometry監視開始に失敗しました:", error);
      });

    const untrackBarHover = platform.trackBarHover(setControlsVisible);
    return () => {
      if (saveTimer) clearTimeout(saveTimer);
      unwatchGeometry?.();
      untrackBarHover();
    };
  }, [platform]);

  return (
    <main className="comment-overlay-window" data-testid="comment-overlay-window">
      <div className="comment-overlay-window__frame" aria-hidden="true" />
      <OverlayStage
        key={stageKey}
        className="comment-overlay-window__comment-layer"
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
      <OverlayControlBar visible={controlsVisible} platform={platform} />
      {RESIZE_HANDLES.map(({ direction, className }) => (
        <span
          key={direction}
          aria-hidden="true"
          className={`comment-overlay-window__resize ${className}`}
          onPointerDown={(event) => startResizing(event, direction, platform)}
        />
      ))}
    </main>
  );
}
