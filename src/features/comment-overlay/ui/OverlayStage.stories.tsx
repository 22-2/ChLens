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
