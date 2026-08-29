import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { projectCommentResponse } from "../domain";
import type { CommentCandidate } from "../domain/comment-types";
import { OverlayStage, type OverlayStageProps } from "./OverlayStage";
import type { ChLensLiveSource } from "../../../../apps/chlens-live/src/live-session/source";
import { createChLensStorybookSource } from "./storybook-source";

const INITIAL_COMMENTS: readonly CommentCandidate[] = [
  { responseNumber: 1, text: "実況開始", author: "名無し" },
  { responseNumber: 2, text: "短いコメント", author: "名無し" },
  {
    responseNumber: 3,
    text: "Danmakuの速度モデルで流れる長めのコメントを確認するレスです",
    author: "名無し",
  },
  { responseNumber: 4, text: "改行を含む\nコメント", author: "名無し" },
];

interface LoadedThreadStoryData {
  url: string;
  title: string;
  comments: readonly CommentCandidate[];
}

async function loadThreadStoryData(
  source: ChLensLiveSource,
  rawUrl: string,
): Promise<LoadedThreadStoryData> {
  const url = rawUrl.trim();
  if (!url) throw new Error("スレッドURLを入力してください");

  const thread = await source.loadThread(url);
  const comments = thread.posts
    .map((post) =>
      projectCommentResponse({
        num: post.number,
        name: post.name,
        message: post.message,
        date: post.date,
        id: post.id,
      }),
    )
    .filter((comment): comment is CommentCandidate => comment !== null);

  return {
    url,
    title: thread.title?.trim() || url,
    comments,
  };
}

interface ThreadUrlFormProps {
  url: string;
  loading: boolean;
  error: string | null;
  title: string | null;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
}

function ThreadUrlForm({ url, loading, error, title, onUrlChange, onSubmit }: ThreadUrlFormProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
    >
      <label style={{ display: "flex", flex: "1 1 480px", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#a9c1db", fontSize: 13, whiteSpace: "nowrap" }}>スレURL</span>
        <input
          aria-label="スレッドURL"
          type="url"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="https://bbs.eddibb.cc/test/read.cgi/liveedge/スレ番号/"
          style={{
            minWidth: 240,
            flex: "1 1 auto",
            border: "1px solid #426189",
            borderRadius: 4,
            padding: "7px 9px",
            color: "#eff6ff",
            background: "#111d30",
          }}
        />
      </label>
      <button type="submit" disabled={loading || !url.trim()}>
        {loading ? "取得中…" : "URLから読み込み"}
      </button>
      {title ? <span style={{ color: "#d8e7f7", fontSize: 13 }}>{title}</span> : null}
      {error ? (
        <span role="alert" style={{ width: "100%", color: "#ff9e9e", fontSize: 13 }}>
          {error}
        </span>
      ) : null}
    </form>
  );
}

const meta = {
  title: "ChLens/コメントOverlay/OverlayStage",
  component: OverlayStage,
  parameters: {
    docs: {
      description: {
        component:
          "Danmakuの速度モデルを使い、Tauriを起動せずにコメントの速度・lane・queueを確認する表示部品です。",
      },
    },
  },
  argTypes: {
    comments: { table: { disable: true } },
    estimateWidth: { table: { disable: true } },
    onQueueOverflow: { table: { disable: true } },
    className: { table: { disable: true } },
    fitToContainer: { table: { disable: true } },
    stageWidth: { control: { type: "number", min: 320, step: 40 } },
    stageHeight: { control: { type: "number", min: 80, step: 20 } },
    maxLaneCount: { control: { type: "number", min: 1, max: 40, step: 1 } },
    laneHeight: { control: { type: "number", min: 16, step: 2 } },
    baseSpeedPxPerSecond: { control: { type: "number", min: 20, step: 10 } },
    maxQueueSize: { control: { type: "number", min: 0, step: 1 } },
    collisionMode: {
      control: "select",
      options: ["strict", "adaptive", "none"],
    },
    backlogPolicy: {
      control: "select",
      options: ["queue", "drop"],
    },
    maxActiveCount: { control: { type: "number", min: 1, step: 1 } },
    fontSize: { control: { type: "number", min: 10, step: 1 } },
    commentOpacity: { control: { type: "number", min: 0, max: 1, step: 0.05 } },
    backgroundColor: { control: "color" },
    playing: { control: "boolean" },
    interactive: { control: "boolean" },
    showCommentInfo: { control: "boolean" },
  },
} satisfies Meta<typeof OverlayStage>;

export default meta;
type Story = StoryObj<typeof meta>;

function HardcodedStory(args: OverlayStageProps) {
  const [comments, setComments] = useState<readonly CommentCandidate[]>(INITIAL_COMMENTS);
  const [playing, setPlaying] = useState(args.playing ?? true);
  const [stageKey, setStageKey] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const addComments = (count: number) => {
    setComments((current) => {
      const firstResponseNumber = (current.at(-1)?.responseNumber ?? 0) + 1;
      const additions = Array.from({ length: count }, (_, index) => {
        const responseNumber = firstResponseNumber + index;
        return {
          responseNumber,
          text: `追加レス ${responseNumber}：queueとlaneの動きを確認`,
          author: "名無し",
        };
      });
      return [...current, ...additions];
    });
  };

  const reset = () => {
    setComments(INITIAL_COMMENTS);
    setSkippedCount(0);
    setStageKey((current) => current + 1);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        minHeight: 320,
        flexDirection: "column",
        gap: 16,
        padding: 24,
        background: "#0d1524",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => setPlaying((current) => !current)}>
          {playing ? "停止" : "再生"}
        </button>
        <button type="button" onClick={() => addComments(1)}>
          1レス追加
        </button>
        <button type="button" onClick={() => addComments(20)}>
          20レス追加
        </button>
        <button type="button" onClick={reset}>
          リセット
        </button>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>
          固定レス {comments.length}件 / skip {skippedCount}件 / Tauriなし
        </span>
      </div>
      <div style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
        <OverlayStage
          key={stageKey}
          {...args}
          comments={comments}
          fitToContainer
          playing={playing}
          onQueueOverflow={() => setSkippedCount((current) => current + 1)}
        />
      </div>
    </div>
  );
}

function PastThreadReplayStory(args: OverlayStageProps) {
  const source = useMemo(() => createChLensStorybookSource(), []);
  const [url, setUrl] = useState("");
  const [loadedThread, setLoadedThread] = useState<LoadedThreadStoryData | null>(null);
  const [comments, setComments] = useState<readonly CommentCandidate[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageKey, setStageKey] = useState(0);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ active: 0, pending: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    setLoadedThread(null);
    setComments([]);
    setCursor(0);
    setStageKey((current) => current + 1);

    try {
      const nextThread = await loadThreadStoryData(source, url);
      setLoadedThread(nextThread);
      setPlaying(nextThread.comments.length > 0);
      setStageKey((current) => current + 1);
    } catch (loadError: unknown) {
      console.error("[Storybook] past thread load failed:", loadError);
      setError(loadError instanceof Error ? loadError.message : "スレッドの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [source, url]);

  useEffect(() => {
    if (!playing || !loadedThread || cursor >= loadedThread.comments.length) return;

    // 変更理由: 過去ログは全件同時投入せず、取得済みレスの到着間隔を再現して
    // strict queueと再生停止を実際の操作に近い形で確認できるようにする。
    const timer = window.setTimeout(() => {
      const nextComment = loadedThread.comments[cursor];
      if (!nextComment) return;
      setComments((current) => [...current, nextComment]);
      setCursor((current) => current + 1);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [cursor, loadedThread, playing]);

  useEffect(() => {
    if (loadedThread && cursor >= loadedThread.comments.length) setPlaying(false);
  }, [cursor, loadedThread]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stage = stageHostRef.current?.querySelector<HTMLElement>(
        '[data-testid="comment-overlay-stage"]',
      );
      if (!stage) return;
      setStats({
        active: Number(stage.dataset.activeCount ?? 0),
        pending: Number(stage.dataset.pendingCount ?? 0),
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const restart = () => {
    // 変更理由: schedulerはStoryのkey変更時にlaneとclockを同時に初期化するため、
    // 過去ログを先頭から再生しても前回のactiveコメントが混ざらない。
    setComments([]);
    setCursor(0);
    setPlaying(true);
    setStageKey((current) => current + 1);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        minHeight: 360,
        flexDirection: "column",
        gap: 12,
        padding: 20,
        background: "#0d1524",
      }}
    >
      <ThreadUrlForm
        url={url}
        loading={loading}
        error={error}
        title={loadedThread?.title ?? null}
        onUrlChange={setUrl}
        onSubmit={() => void load()}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => setPlaying((current) => !current)}>
          {playing ? "停止" : "再生"}
        </button>
        <button type="button" onClick={restart} disabled={!loadedThread}>
          最初から
        </button>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>
          {loadedThread ? `過去ログ ${cursor}/${loadedThread.comments.length}件` : "過去ログ未読込"}{" "}
          / active {stats.active} / pending {stats.pending} / strict + queue
        </span>
      </div>
      <div ref={stageHostRef} style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
        <OverlayStage
          key={stageKey}
          {...args}
          comments={comments}
          fitToContainer
          playing={playing}
        />
      </div>
    </div>
  );
}

function CurrentThreadStory(args: OverlayStageProps) {
  const source = useMemo(() => createChLensStorybookSource(), []);
  const [url, setUrl] = useState("");
  const [loadedThread, setLoadedThread] = useState<LoadedThreadStoryData | null>(null);
  const [comments, setComments] = useState<readonly CommentCandidate[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageKey, setStageKey] = useState(0);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const lastResponseNumber = useRef(0);
  const requestInFlight = useRef(false);
  const [stats, setStats] = useState({ active: 0, pending: 0 });

  const load = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    setError(null);
    setStreaming(false);
    setLoadedThread(null);
    setComments([]);
    lastResponseNumber.current = 0;
    setStageKey((current) => current + 1);

    try {
      const nextThread = await loadThreadStoryData(source, url);
      setLoadedThread(nextThread);
      setComments(nextThread.comments);
      lastResponseNumber.current = latestCommentNumber(nextThread.comments);
      setStreaming(true);
      setStageKey((current) => current + 1);
    } catch (loadError: unknown) {
      console.error("[Storybook] current thread load failed:", loadError);
      setError(loadError instanceof Error ? loadError.message : "スレッドの取得に失敗しました");
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [source, url]);

  const refresh = useCallback(async () => {
    if (!loadedThread || requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const nextThread = await loadThreadStoryData(source, loadedThread.url);
      const newComments = nextThread.comments.filter(
        (comment) => comment.responseNumber > lastResponseNumber.current,
      );
      if (newComments.length > 0) {
        lastResponseNumber.current = latestCommentNumber(newComments);
        setComments((current) => [...current, ...newComments]);
      }
      setLoadedThread(nextThread);
    } catch (refreshError: unknown) {
      console.error("[Storybook] current thread refresh failed:", refreshError);
      setError(
        refreshError instanceof Error ? refreshError.message : "新着レスの取得に失敗しました",
      );
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [loadedThread, source]);

  useEffect(() => {
    if (!streaming || !loadedThread) return;

    // 変更理由: 現行スレは入力されたURLを固定して再取得し、次スレ探索を行わずに
    // 同じスレッドの新着レスだけをOverlayへ追加する。
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [loadedThread, refresh, streaming]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stage = stageHostRef.current?.querySelector<HTMLElement>(
        '[data-testid="comment-overlay-stage"]',
      );
      if (!stage) return;
      setStats({
        active: Number(stage.dataset.activeCount ?? 0),
        pending: Number(stage.dataset.pendingCount ?? 0),
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const reset = () => {
    if (!loadedThread) return;
    setComments(loadedThread.comments);
    lastResponseNumber.current = latestCommentNumber(loadedThread.comments);
    setStageKey((current) => current + 1);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        minHeight: 360,
        flexDirection: "column",
        gap: 12,
        padding: 20,
        background: "#0d1524",
      }}
    >
      <ThreadUrlForm
        url={url}
        loading={loading}
        error={error}
        title={loadedThread?.title ?? null}
        onUrlChange={setUrl}
        onSubmit={() => void load()}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => setStreaming((current) => !current)}>
          {streaming ? "新着停止" : "新着再開"}
        </button>
        <button type="button" onClick={() => void refresh()} disabled={!loadedThread || loading}>
          今すぐ更新
        </button>
        <button type="button" onClick={reset} disabled={!loadedThread}>
          リセット
        </button>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>
          {loadedThread ? `現行スレ ${comments.length}件` : "現行スレ未読込"} / active{" "}
          {stats.active} / pending {stats.pending} / 同じURLのみ更新・自動次スレなし
        </span>
      </div>
      <div ref={stageHostRef} style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
        <OverlayStage key={stageKey} {...args} comments={comments} fitToContainer playing />
      </div>
    </div>
  );
}

function latestCommentNumber(comments: readonly CommentCandidate[]): number {
  return comments.reduce((latest, comment) => Math.max(latest, comment.responseNumber), 0);
}

function StressStory(args: OverlayStageProps) {
  const [comments, setComments] = useState<readonly CommentCandidate[]>(INITIAL_COMMENTS);
  const [commentsPerSecond, setCommentsPerSecond] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [stats, setStats] = useState({ active: 0, pending: 0 });
  const [stageKey, setStageKey] = useState(0);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const nextResponseNumber = useRef(INITIAL_COMMENTS.at(-1)?.responseNumber ?? 0);

  const addComments = useCallback((count: number) => {
    setComments((current) => {
      const additions = Array.from({ length: count }, () => {
        const responseNumber = ++nextResponseNumber.current;
        return {
          responseNumber,
          text: `実況 ${responseNumber}：DPlayer風の即時投入とadaptive衝突を確認する長めのレス`,
          author: "名無し",
        };
      });
      return [...current, ...additions].slice(-3000);
    });
  }, []);

  useEffect(() => {
    if (commentsPerSecond <= 0) return;

    const intervalMs = 100;
    const batchSize = Math.max(1, Math.round((commentsPerSecond * intervalMs) / 1000));
    const timer = window.setInterval(() => addComments(batchSize), intervalMs);
    return () => window.clearInterval(timer);
  }, [addComments, commentsPerSecond]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stage = stageHostRef.current?.querySelector<HTMLElement>(
        '[data-testid="comment-overlay-stage"]',
      );
      if (!stage) return;
      setStats({
        active: Number(stage.dataset.activeCount ?? 0),
        pending: Number(stage.dataset.pendingCount ?? 0),
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const reset = () => {
    setComments(INITIAL_COMMENTS);
    nextResponseNumber.current = INITIAL_COMMENTS.at(-1)?.responseNumber ?? 0;
    setSkippedCount(0);
    setStageKey((current) => current + 1);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        minHeight: 360,
        flexDirection: "column",
        gap: 12,
        padding: 20,
        background: "#0d1524",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {[0, 10, 30, 60, 120, 300].map((rate) => (
          <button key={rate} type="button" onClick={() => setCommentsPerSecond(rate)}>
            {rate === 0 ? "停止" : `${rate}件/秒`}
          </button>
        ))}
        <button type="button" onClick={() => addComments(100)}>
          100件追加
        </button>
        <button type="button" onClick={reset}>
          リセット
        </button>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>
          入力 {commentsPerSecond}件/秒 / active {stats.active} / pending {stats.pending} / skip{" "}
          {skippedCount} / mode {args.collisionMode ?? "adaptive"}
        </span>
      </div>
      <div ref={stageHostRef} style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
        <OverlayStage
          key={stageKey}
          {...args}
          comments={comments}
          fitToContainer
          onQueueOverflow={() => setSkippedCount((current) => current + 1)}
        />
      </div>
    </div>
  );
}

export const Hardcoded: Story = {
  render: (args) => <HardcodedStory {...args} />,
  args: {
    comments: INITIAL_COMMENTS,
    stageWidth: 800,
    stageHeight: 240,
    laneHeight: 32,
    maxLaneCount: 24,
    baseSpeedPxPerSecond: 90,
    maxQueueSize: 0,
    collisionMode: "adaptive",
    backlogPolicy: "drop",
    maxActiveCount: 3000,
    fontSize: 20,
    commentOpacity: 0.95,
    backgroundColor: "#172235",
    fitToContainer: true,
    playing: true,
    interactive: true,
    showCommentInfo: true,
  },
};

export const PastThreadReplay: Story = {
  render: (args) => <PastThreadReplayStory {...args} />,
  args: {
    comments: [],
    stageWidth: 900,
    stageHeight: 320,
    laneHeight: 32,
    maxLaneCount: 24,
    baseSpeedPxPerSecond: 90,
    maxQueueSize: 64,
    collisionMode: "strict",
    backlogPolicy: "queue",
    maxActiveCount: 3000,
    fontSize: 18,
    commentOpacity: 0.95,
    backgroundColor: "#172235",
    fitToContainer: true,
    playing: true,
    interactive: true,
    showCommentInfo: true,
  },
};

export const CurrentThread: Story = {
  render: (args) => <CurrentThreadStory {...args} />,
  args: {
    comments: [],
    stageWidth: 900,
    stageHeight: 320,
    laneHeight: 32,
    maxLaneCount: 24,
    baseSpeedPxPerSecond: 90,
    maxQueueSize: 0,
    collisionMode: "adaptive",
    backlogPolicy: "drop",
    maxActiveCount: 3000,
    fontSize: 18,
    commentOpacity: 0.95,
    backgroundColor: "#172235",
    fitToContainer: true,
    playing: true,
    interactive: true,
    showCommentInfo: true,
  },
};

export const Stress: Story = {
  render: (args) => <StressStory {...args} />,
  args: {
    comments: INITIAL_COMMENTS,
    stageWidth: 900,
    stageHeight: 320,
    laneHeight: 32,
    maxLaneCount: 24,
    baseSpeedPxPerSecond: 90,
    maxQueueSize: 0,
    collisionMode: "adaptive",
    backlogPolicy: "drop",
    maxActiveCount: 3000,
    fontSize: 18,
    commentOpacity: 0.95,
    backgroundColor: "#172235",
    fitToContainer: true,
    playing: true,
    interactive: false,
    showCommentInfo: false,
  },
};
