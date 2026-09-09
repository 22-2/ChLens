import { useEffect, useMemo, useState, type ReactElement } from "react";
import { OverlayStage } from "src/features/comment-overlay/ui/OverlayStage";
import datFixtureUrl from "../fixtures/nintendo-direct-2026-09-09.dat?url";
import {
  commentsAvailableAt,
  createTimedDatComments,
  type TimedDatComment,
} from "./timed-dat-replay";

const POLLING_INTERVAL_MILLISECONDS = 10_000;

export default {
  title: "Live/実スレ再現",
  parameters: {
    docs: {
      description: {
        component:
          "ローカル保存したdatを投稿時刻順に10秒区切りで取得し、リアルタイム更新を擬似再現します。外部通信は行いません。",
      },
    },
  },
};

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function NintendoDirectを10秒ごとに再生(): ReactElement {
  const [comments, setComments] = useState<readonly TimedDatComment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // 変更理由: Storyを開いてから再生操作を待つとfixtureの読み込み失敗と停止状態を
  // 見分けにくいため、読み込み完了後は最初の投稿から自動的に再生を始める。
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    let cancelled = false;
    void fetch(datFixtureUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(`fixtureの読み込みに失敗しました (${response.status})`);
        const bytes = await response.arrayBuffer();
        const parsed = createTimedDatComments(new TextDecoder("shift_jis").decode(bytes));
        if (!cancelled) setComments(parsed);
      })
      .catch((error: unknown) => {
        console.error("[Chlens Live] dat再生fixtureの読み込みに失敗しました:", error);
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : "fixtureの読み込みに失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const duration = comments.at(-1)?.elapsedMilliseconds ?? 0;
  useEffect(() => {
    if (!playing || comments.length === 0) return;
    const timer = window.setInterval(() => {
      setElapsed((current) => {
        const next = Math.min(current + POLLING_INTERVAL_MILLISECONDS, duration);
        if (next >= duration) setPlaying(false);
        return next;
      });
    }, POLLING_INTERVAL_MILLISECONDS / speed);
    return () => window.clearInterval(timer);
  }, [comments.length, duration, playing, speed]);

  const available = useMemo(() => commentsAvailableAt(comments, elapsed), [comments, elapsed]);
  const visible = available.slice(-200);
  const advance = () =>
    setElapsed((current) => Math.min(current + POLLING_INTERVAL_MILLISECONDS, duration));
  const restart = () => {
    setElapsed(0);
    setPlaying(true);
  };

  return (
    <main className="timed-replay">
      <header className="timed-replay__header">
        <div>
          <strong>Nintendo Direct 2026.9.9 ★5</strong>
          <span>ローカルdat・擬似リアルタイム再生</span>
        </div>
        <div className="timed-replay__clock">
          <small>現在時間</small>
          <output>{formatTime(elapsed)}</output>
          <span>/ {formatTime(duration)}</span>
        </div>
      </header>
      <section className="timed-replay__stage">
        {loadError ? <p role="alert">{loadError}</p> : null}
        <OverlayStage
          comments={visible}
          fitToContainer
          stageWidth={1100}
          stageHeight={520}
          fontFamily="MS PGothic"
          fontWeight={750}
          fontColor="#ffffff"
          shadowSize={2}
          shadowColor="#000000"
          shadowDirections={["bottom-right"]}
          durationSeconds={6}
          maxActiveCount={80}
          maxQueueSize={120}
          backgroundColor="transparent"
          interactive={false}
          showCommentInfo={false}
        />
      </section>
      <footer className="timed-replay__controls">
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          disabled={comments.length === 0}
        >
          {playing ? "一時停止" : "再生"}
        </button>
        <button
          type="button"
          onClick={advance}
          disabled={comments.length === 0 || elapsed >= duration}
        >
          10秒進める
        </button>
        <button type="button" onClick={restart} disabled={comments.length === 0}>
          最初から
        </button>
        <label>
          再生速度
          <select value={speed} onChange={(event) => setSpeed(Number(event.currentTarget.value))}>
            <option value={1}>1倍（10秒ごと）</option>
            <option value={5}>5倍（2秒ごと）</option>
            <option value={10}>10倍（1秒ごと）</option>
          </select>
        </label>
        <span>
          今回取得: <strong>{available.length}</strong> / 全{comments.length}レス
        </span>
      </footer>
    </main>
  );
}
