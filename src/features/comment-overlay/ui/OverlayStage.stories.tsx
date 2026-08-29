import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommentCandidate } from "../domain/comment-types";
import { OverlayStage, type OverlayStageProps } from "./OverlayStage";

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

const PAST_THREAD_COMMENTS: readonly CommentCandidate[] = [
  {
    responseNumber: 1,
    text: "過去ログの再生を開始します",
    author: "名無し",
    id: "past-a1",
    date: "2026/08/30 20:00:01",
  },
  {
    responseNumber: 2,
    text: "この時間帯はまだ落ち着いてる",
    author: "名無し",
    id: "past-b2",
    date: "2026/08/30 20:00:04",
  },
  {
    responseNumber: 3,
    text: "きたきたきた",
    author: "実況民",
    id: "past-c3",
    date: "2026/08/30 20:00:07",
  },
  {
    responseNumber: 4,
    text: "長めの過去レスを流して、strict queueの挙動を確認する",
    author: "名無し",
    id: "past-d4",
    date: "2026/08/30 20:00:09",
  },
  {
    responseNumber: 5,
    text: "これは保存済みスレッドのfixtureです",
    author: "名無し",
    id: "past-e5",
    date: "2026/08/30 20:00:12",
  },
  {
    responseNumber: 6,
    text: "レスの間隔も再生対象にする",
    author: "実況民",
    id: "past-f6",
    date: "2026/08/30 20:00:15",
  },
  {
    responseNumber: 7,
    text: "弾幕が混んできたので待機状態を見てみる",
    author: "名無し",
    id: "past-g7",
    date: "2026/08/30 20:00:18",
  },
  {
    responseNumber: 8,
    text: "strict replayでは安全なlaneが空くまで待つ",
    author: "名無し",
    id: "past-h8",
    date: "2026/08/30 20:00:21",
  },
  {
    responseNumber: 9,
    text: "再生を止めてコメントにhoverすると詳細が表示されます",
    author: "実況民",
    id: "past-i9",
    date: "2026/08/30 20:00:24",
  },
  {
    responseNumber: 10,
    text: "過去ログでも本文とIDを確認できる",
    author: "名無し",
    id: "past-j10",
    date: "2026/08/30 20:00:27",
  },
  {
    responseNumber: 11,
    text: "ここから少し流量を上げる",
    author: "名無し",
    id: "past-k11",
    date: "2026/08/30 20:00:30",
  },
  {
    responseNumber: 12,
    text: "DPlayer風の表示密度を過去ログでも確認する",
    author: "実況民",
    id: "past-l12",
    date: "2026/08/30 20:00:32",
  },
];

const CURRENT_THREAD_INITIAL_COMMENTS: readonly CommentCandidate[] = [
  {
    responseNumber: 120,
    text: "現行スレを監視中",
    author: "名無し",
    id: "live-a0",
    date: "2026/08/30 21:10:00",
  },
  {
    responseNumber: 121,
    text: "新着レスは同じスレへ追加されます",
    author: "実況民",
    id: "live-b1",
    date: "2026/08/30 21:10:02",
  },
];

const CURRENT_THREAD_INCOMING_COMMENTS: readonly CommentCandidate[] = [
  {
    responseNumber: 122,
    text: "現行スレの新着レスです",
    author: "名無し",
    id: "live-c2",
    date: "2026/08/30 21:10:04",
  },
  {
    responseNumber: 123,
    text: "自動次スレ移動はこのStoryでは行いません",
    author: "名無し",
    id: "live-d3",
    date: "2026/08/30 21:10:06",
  },
  {
    responseNumber: 124,
    text: "新着の到着順にadaptiveで即時投入する",
    author: "実況民",
    id: "live-e4",
    date: "2026/08/30 21:10:08",
  },
  {
    responseNumber: 125,
    text: "hoverで停止してIDを確認できる",
    author: "名無し",
    id: "live-f5",
    date: "2026/08/30 21:10:10",
  },
  {
    responseNumber: 126,
    text: "このfixtureは現在のスレッドだけを流し続けます",
    author: "名無し",
    id: "live-g6",
    date: "2026/08/30 21:10:12",
  },
  {
    responseNumber: 127,
    text: "流量が増えたときの重なりもここで確認する",
    author: "実況民",
    id: "live-h7",
    date: "2026/08/30 21:10:14",
  },
  {
    responseNumber: 128,
    text: "ChLens側のレス情報をOverlayへ渡す想定",
    author: "名無し",
    id: "live-i8",
    date: "2026/08/30 21:10:16",
  },
];

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
  const [comments, setComments] = useState<readonly CommentCandidate[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [stageKey, setStageKey] = useState(0);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ active: 0, pending: 0 });

  useEffect(() => {
    if (!playing || cursor >= PAST_THREAD_COMMENTS.length) return;

    // 変更理由: 過去ログは全件同時投入せず、取得済みレスの到着間隔を再現して
    // strict queueと再生停止を実際の操作に近い形で確認できるようにする。
    const timer = window.setTimeout(() => {
      const nextComment = PAST_THREAD_COMMENTS[cursor];
      if (!nextComment) return;
      setComments((current) => [...current, nextComment]);
      setCursor((current) => current + 1);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [cursor, playing]);

  useEffect(() => {
    if (cursor >= PAST_THREAD_COMMENTS.length) setPlaying(false);
  }, [cursor]);

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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => setPlaying((current) => !current)}>
          {playing ? "停止" : "再生"}
        </button>
        <button type="button" onClick={restart}>
          最初から
        </button>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>
          過去ログ {cursor}/{PAST_THREAD_COMMENTS.length}件 / active {stats.active} / pending{" "}
          {stats.pending} / strict + queue
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
  const [comments, setComments] = useState<readonly CommentCandidate[]>(
    CURRENT_THREAD_INITIAL_COMMENTS,
  );
  const [streaming, setStreaming] = useState(true);
  const [stageKey, setStageKey] = useState(0);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const nextCommentIndex = useRef(0);
  const [stats, setStats] = useState({ active: 0, pending: 0 });

  const appendNextComment = useCallback(() => {
    const nextComment = CURRENT_THREAD_INCOMING_COMMENTS[nextCommentIndex.current];
    if (!nextComment) {
      setStreaming(false);
      return;
    }

    nextCommentIndex.current += 1;
    setComments((current) => [...current, nextComment]);
    if (nextCommentIndex.current >= CURRENT_THREAD_INCOMING_COMMENTS.length) {
      setStreaming(false);
    }
  }, []);

  useEffect(() => {
    if (!streaming) return;

    // 変更理由: 現行スレfixtureは同じスレッドの新着だけを一定間隔で追加し、
    // 自動次スレ移動や別スレへの切り替えを混ぜずにrealtime表示を確認する。
    const timer = window.setInterval(appendNextComment, 900);
    return () => window.clearInterval(timer);
  }, [appendNextComment, streaming]);

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
    setComments(CURRENT_THREAD_INITIAL_COMMENTS);
    nextCommentIndex.current = 0;
    setStreaming(true);
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
        <button type="button" onClick={() => setStreaming((current) => !current)}>
          {streaming ? "新着停止" : "新着再開"}
        </button>
        <button type="button" onClick={appendNextComment}>
          次のレス
        </button>
        <button type="button" onClick={reset}>
          リセット
        </button>
        <span style={{ color: "#a9c1db", fontSize: 13 }}>
          現行スレ {comments.length}件 / active {stats.active} / pending {stats.pending} /
          自動次スレなし
        </span>
      </div>
      <div ref={stageHostRef} style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
        <OverlayStage key={stageKey} {...args} comments={comments} fitToContainer playing />
      </div>
    </div>
  );
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
    comments: CURRENT_THREAD_INITIAL_COMMENTS,
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
