import "./ArchiveReplayWindow.css";

import { Pause, Play, RotateCcw, SkipBack, SkipForward, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { container } from "src/service-container";
import type { IThreadDetail } from "src/service-container/interfaces";
import { Button } from "src/view/browser/ui/Button";
import { Dialog } from "src/view/browser/ui/Dialog";

import {
  type ArchiveReplaySource,
  type ArchiveReplayTimeline,
  type ArchiveReplayTimelineComment,
  createArchiveReplayTimeline,
  getArchiveReplayCommentsThroughPosition,
  getArchiveReplaySeekPosition,
  parseArchiveReplayStartInput,
  parseArchiveReplayTimestamp,
  projectCommentResponse,
} from "../domain";
import type { CommentCandidate } from "../domain/comment-types";
import { DEFAULT_COMMENT_HISTORY_LIMIT, OverlayStage } from "./OverlayStage";

interface ArchiveReplayWindowProps {
  open: boolean;
  onClose: () => void;
}

interface LoadedArchiveReplayData {
  timeline: ArchiveReplayTimeline;
  titles: readonly string[];
  errors: readonly string[];
}

interface LoadedThreadData {
  source: ArchiveReplaySource;
  title: string;
}

const DEFAULT_DURATION_MINUTES = "30";
const DEFAULT_REPLAY_RATE = "1";

/**
 * 複数スレッドの過去ログを、実況の開始位置へ合わせて再生する操作窓。
 * 変更理由: Storybookだけに実装を置くと、コマンドパレットから開いた利用者が
 * 実際のログを再生できないため、サービスコンテナを使う本番側にも同じ同期処理を持たせる。
 */
export function ArchiveReplayWindow({ open, onClose }: ArchiveReplayWindowProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [urls, setUrls] = useState("");
  const [startInput, setStartInput] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [replayRateInput, setReplayRateInput] = useState(DEFAULT_REPLAY_RATE);
  const [loadedReplay, setLoadedReplay] = useState<LoadedArchiveReplayData | null>(null);
  const [position, setPosition] = useState(0);
  const [seekStartPosition, setSeekStartPosition] = useState(0);
  const positionRef = useRef(0);
  const [syncOffset, setSyncOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageKey, setStageKey] = useState(0);

  useEffect(() => {
    setPortalContainer(document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!open) {
      // ダイアログを閉じている間はrequestAnimationFrameを止め、再度開いたときに
      // 見えないところで再生位置だけが進む状態を避ける。
      setPlaying(false);
    }
  }, [open]);

  const replayRate = useMemo(() => {
    const parsed = Number(replayRateInput);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10) : 1;
  }, [replayRateInput]);

  const resetPlayback = useCallback(() => {
    setPlaying(false);
    setLoadedReplay(null);
    setPosition(0);
    setSeekStartPosition(0);
    positionRef.current = 0;
    setSyncOffset(0);
    setStageKey((current) => current + 1);
  }, []);

  const load = useCallback(async () => {
    const requestedStartAt = startInput ? parseArchiveReplayStartInput(startInput) : null;
    const parsedDurationMinutes = Number(durationMinutes);
    const inputUrls = [
      ...new Set(
        urls
          .split(/\r?\n/)
          .map((url) => url.trim())
          .filter(Boolean),
      ),
    ];

    if (startInput && requestedStartAt === null) {
      setError("開始日時を確認してください（日本時間）");
      return;
    }
    if (!Number.isFinite(parsedDurationMinutes) || parsedDurationMinutes <= 0) {
      setError("再生時間は1分以上で入力してください");
      return;
    }
    if (inputUrls.length === 0) {
      setError("実況スレッドURLを1件以上入力してください");
      return;
    }

    setLoading(true);
    setError(null);
    resetPlayback();

    try {
      const settled = await Promise.all(
        inputUrls.map(async (threadUrl): Promise<LoadedThreadData | string> => {
          try {
            const thread = await container.thread.getThread(threadUrl);
            return {
              source: {
                threadUrl,
                comments: projectThreadComments(thread),
              },
              title: thread.title?.trim() || threadUrl,
            };
          } catch (loadError: unknown) {
            // URL単位の失敗は他スレの取得を止めず、画面に残して利用者が確認できるようにする。
            console.error("[ArchiveReplay] スレッドの取得に失敗しました", {
              threadUrl,
              error: loadError,
            });
            return `${threadUrl}: ${
              loadError instanceof Error ? loadError.message : "取得に失敗しました"
            }`;
          }
        }),
      );
      const loadedThreads = settled.filter(
        (result): result is LoadedThreadData => typeof result !== "string",
      );
      if (loadedThreads.length === 0) {
        throw new Error("取得できたスレッドがありません");
      }

      // 毎回の日付入力を省けるよう、未指定なら取得結果の最初の投稿を開始候補にする。
      // 自動判定ではなくログの最古時刻なので、必要なら後から日時欄で明示的に調整できる。
      const startAt =
        requestedStartAt ??
        loadedThreads.reduce<number | null>(
          (earliest, item) =>
            item.source.comments.reduce<number | null>((candidate, comment) => {
              const timestamp = parseArchiveReplayTimestamp(comment.date ?? "");
              return timestamp === null
                ? candidate
                : candidate === null
                  ? timestamp
                  : Math.min(candidate, timestamp);
            }, earliest),
          null,
        );
      if (startAt === null) {
        throw new Error(
          "投稿日時を読み取れるレスがありません。開始日時と取得したログを確認してください",
        );
      }

      const timeline = createArchiveReplayTimeline(
        loadedThreads.map(({ source }) => source),
        {
          startAt,
          durationSeconds: parsedDurationMinutes * 60,
        },
      );
      setLoadedReplay({
        timeline,
        titles: loadedThreads.map(({ title }) => title),
        errors: settled.filter((result): result is string => typeof result === "string"),
      });
      setStageKey((current) => current + 1);
    } catch (loadError: unknown) {
      console.error("[ArchiveReplay] 過去ログの読み込みに失敗しました", loadError);
      setError(loadError instanceof Error ? loadError.message : "スレッドの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [durationMinutes, resetPlayback, startInput, urls]);

  useEffect(() => {
    if (!playing || !loadedReplay) return;

    // 実時間との差から位置を計算し、タブ切り替えや負荷によるframe遅延が累積しないようにする。
    const startedAt = performance.now();
    const startedPosition = positionRef.current;
    let frameId = 0;
    const tick = (now: number) => {
      const nextPosition = Math.min(
        loadedReplay.timeline.durationSeconds,
        startedPosition + ((now - startedAt) / 1_000) * replayRate,
      );
      positionRef.current = nextPosition;
      setPosition(nextPosition);
      if (nextPosition >= loadedReplay.timeline.durationSeconds) {
        setPlaying(false);
        return;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // シーク後に古いstartedPositionへ戻さないよう、表示世代の更新時に時計を張り直す。
  }, [loadedReplay, playing, replayRate, stageKey]);

  const seek = useCallback(
    (nextPosition: number) => {
      if (!loadedReplay) return;
      const clamped = Math.min(Math.max(0, nextPosition), loadedReplay.timeline.durationSeconds);
      positionRef.current = clamped;
      setPosition(clamped);
      // schedulerは時計の逆行を扱わないため、シークでは表示世代を作り直す。
      // 移動先より前のレスを再投入しない境界も同時に更新し、短い往復で二重表示しない。
      setSeekStartPosition(clamped);
      setStageKey((current) => current + 1);
    },
    [loadedReplay],
  );

  const seekToComment = useCallback(
    (comment: ArchiveReplayTimelineComment) => {
      if (!loadedReplay) return;
      const nextPosition = getArchiveReplaySeekPosition(
        loadedReplay.timeline,
        { threadUrl: comment.sourceThreadUrl, responseNumber: comment.responseNumber },
        syncOffset,
      );
      if (nextPosition === null) {
        setError("このレスは現在の同期補正では再生範囲外です");
        return;
      }
      setError(null);
      seek(nextPosition);
    },
    [loadedReplay, seek, syncOffset],
  );

  const visibleComments = loadedReplay
    ? getArchiveReplayCommentsThroughPosition(loadedReplay.timeline, position, syncOffset)
        .filter((comment) => comment.replayOffsetSeconds + syncOffset >= seekStartPosition)
        .slice(-DEFAULT_COMMENT_HISTORY_LIMIT)
    : [];
  const replayTime = loadedReplay
    ? formatReplayClock(loadedReplay.timeline.startAt + position * 1_000)
    : "--:--:--";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="browser-dialog-overlay archive-replay-window__overlay" />
        <Dialog.Content className="browser-dialog-content archive-replay-window__content">
          <div className="archive-replay-window__header">
            <div>
              <Dialog.Title className="browser-dialog-title">過去実況再生</Dialog.Title>
              <Dialog.Description className="browser-dialog-description">
                複数スレッドのログを投稿時刻順につないで再生します。
              </Dialog.Description>
            </div>
            <Button
              className="archive-replay-window__close"
              variant="subtle"
              aria-label="過去実況再生を閉じる"
              title="閉じる"
              onClick={onClose}
            >
              <X size={17} />
            </Button>
          </div>

          <form
            className="archive-replay-window__form"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <label className="archive-replay-window__field archive-replay-window__field--urls">
              <span>実況スレッドURL（1行に1件）</span>
              <textarea
                aria-label="実況スレッドURL"
                value={urls}
                onChange={(event) => setUrls(event.currentTarget.value)}
                placeholder="https://example.com/thread-a/\nhttps://example.com/thread-b/"
                rows={3}
              />
            </label>
            <div className="archive-replay-window__options">
              <label className="archive-replay-window__field">
                <span>放送開始日時（日本時間・任意）</span>
                <input
                  aria-label="放送開始日時"
                  type="datetime-local"
                  value={startInput}
                  onChange={(event) => setStartInput(event.currentTarget.value)}
                />
              </label>
              <label className="archive-replay-window__field archive-replay-window__field--small">
                <span>再生時間（分）</span>
                <input
                  aria-label="再生時間（分）"
                  type="number"
                  min={1}
                  step={1}
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.currentTarget.value)}
                />
              </label>
              <label className="archive-replay-window__field archive-replay-window__field--small">
                <span>再生倍率</span>
                <input
                  aria-label="再生倍率"
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={replayRateInput}
                  onChange={(event) => setReplayRateInput(event.currentTarget.value)}
                />
              </label>
              <Button type="submit" loading={loading} disabled={!urls.trim()}>
                複数スレを読み込む
              </Button>
            </div>
            <span className="archive-replay-window__note">
              開始日時を空欄にすると、取得したログの最初の投稿から開始します。必要なら日時を指定して調整してください。
            </span>
          </form>

          {error ? (
            <p
              className="archive-replay-window__message archive-replay-window__message--error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {loadedReplay?.errors.map((loadError) => (
            <p
              key={loadError}
              className="archive-replay-window__message archive-replay-window__message--warning"
              role="status"
            >
              一部取得失敗: {loadError}
            </p>
          ))}
          {loadedReplay ? (
            <div className="archive-replay-window__summary">
              {loadedReplay.titles.map((title, index) => (
                <span key={`${index}-${title}`}>
                  スレ{index + 1}: {title}
                </span>
              ))}
              <span>
                対象{loadedReplay.timeline.comments.length}件 / 除外
                {loadedReplay.timeline.skipped.length}件
              </span>
            </div>
          ) : null}

          <div className="archive-replay-window__controls">
            <Button onClick={() => setPlaying((current) => !current)} disabled={!loadedReplay}>
              {playing ? <Pause size={15} /> : <Play size={15} />}
              {playing ? "停止" : "再生"}
            </Button>
            <Button onClick={() => seek(0)} disabled={!loadedReplay}>
              <RotateCcw size={15} />
              最初から
            </Button>
            <Button onClick={() => seek(position - 10)} disabled={!loadedReplay}>
              <SkipBack size={15} />
              10秒戻す
            </Button>
            <Button onClick={() => seek(position + 10)} disabled={!loadedReplay}>
              <SkipForward size={15} />
              10秒進める
            </Button>
            <span className="archive-replay-window__position">
              {loadedReplay ? `${formatReplayDuration(position)} / ` : ""}
              実況時刻 {replayTime}
            </span>
          </div>

          <div className="archive-replay-window__seek-row">
            <input
              aria-label="過去実況の再生位置"
              type="range"
              min={0}
              max={loadedReplay?.timeline.durationSeconds ?? 1}
              step={0.1}
              value={position}
              disabled={!loadedReplay}
              onChange={(event) => seek(Number(event.currentTarget.value))}
            />
            <Button
              variant="subtle"
              onClick={() => {
                setSyncOffset((current) => current - 1);
                seek(position);
              }}
              disabled={!loadedReplay}
            >
              コメントを1秒早く
            </Button>
            <Button
              variant="subtle"
              onClick={() => {
                setSyncOffset((current) => current + 1);
                seek(position);
              }}
              disabled={!loadedReplay}
            >
              コメントを1秒遅く
            </Button>
          </div>

          {loadedReplay ? (
            <details className="archive-replay-window__jump-list">
              <summary>レスを選んでその時刻へ移動</summary>
              <div className="archive-replay-window__jump-items">
                {loadedReplay.timeline.comments.slice(0, 200).map((comment) => (
                  <button
                    key={`${comment.sourceThreadUrl}:${comment.responseNumber}`}
                    type="button"
                    onClick={() => seekToComment(comment)}
                  >
                    <span>
                      レス{comment.responseNumber}（
                      {formatReplayDuration(comment.replayOffsetSeconds)}）
                    </span>
                    <span>{comment.text}</span>
                  </button>
                ))}
              </div>
            </details>
          ) : null}

          <div className="archive-replay-window__stage-host">
            <OverlayStage
              key={stageKey}
              comments={visibleComments}
              fitToContainer
              playing={playing}
              // 取得元の異なる同じレス番号をhover操作で取り違えないよう、再生窓では操作を外側へ集約する。
              interactive={false}
              showCommentInfo={false}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function projectThreadComments(thread: IThreadDetail): readonly CommentCandidate[] {
  return thread.res
    .map((response) => projectCommentResponse(response))
    .filter((comment): comment is CommentCandidate => comment !== null);
}

function formatReplayDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const remainder = wholeSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainder
        .toString()
        .padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function formatReplayClock(timestamp: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}
