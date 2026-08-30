import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  MemoryCommentOverlayEventBus,
  type CommentCandidate,
} from "src/features/comment-overlay/domain";
import { createBrowserCommentOverlayPlatform } from "src/features/comment-overlay/platform/browser";
import { OverlayApp } from "./OverlayApp";
import "src/features/comment-overlay/ui/OverlayStage.css";
import "./styles.css";

const THREAD_URL = "https://example.test/live/1";

const meta = {
  title: "ChLens/コメントOverlay/OverlayApp",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Main相当のcomment-overlay eventを受け取り、Overlay frontendへ新着レスを表示する境界を確認します。",
      },
    },
  },
} satisfies Meta<typeof OverlayApp>;

export default meta;
type Story = StoryObj<typeof meta>;

function publishComments(
  eventBus: MemoryCommentOverlayEventBus,
  comments: readonly CommentCandidate[],
): void {
  void eventBus.publish({
    version: 1,
    type: "batch",
    batch: {
      threadUrl: THREAD_URL,
      comments,
      latestResponseNumber: comments.at(-1)?.responseNumber ?? 0,
    },
  });
}

function OverlayAppPreview() {
  const eventBus = useMemo(() => new MemoryCommentOverlayEventBus(), []);
  const platform = useMemo(() => createBrowserCommentOverlayPlatform(), []);
  const nextResponseNumberRef = useRef(3);
  const compactSettingsRef = useRef(false);

  useEffect(() => {
    // 変更理由: 初回eventを空batchにして、実際の開始時と同じく既存レスを流さない境界を再現する。
    publishComments(eventBus, []);
  }, [eventBus]);

  const addComments = useCallback(
    (count: number) => {
      const comments = Array.from({ length: count }, (_, index) => {
        const responseNumber = nextResponseNumberRef.current + index;
        return {
          responseNumber,
          text: `新着レス ${responseNumber}：MainのeventからOverlayへ表示`,
          author: "名無し",
        };
      });
      nextResponseNumberRef.current += count;
      publishComments(eventBus, comments);
    },
    [eventBus],
  );

  const updateSettings = useCallback(() => {
    compactSettingsRef.current = !compactSettingsRef.current;
    const compact = compactSettingsRef.current;
    void eventBus.publish({
      version: 1,
      type: "settings",
      settings: {
        durationSeconds: compact ? 4 : 6,
        fontSize: compact ? 32 : 30,
        opacity: compact ? 0.65 : 0.95,
        maxQueueSize: compact ? 16 : 64,
      },
    });
  }, [eventBus]);

  return (
    <div style={{ minHeight: "100vh", background: "#0d1524" }}>
      <div
        style={{
          display: "flex",
          position: "relative",
          zIndex: 10,
          gap: 8,
          alignItems: "center",
          padding: 12,
          color: "#d8e7f7",
        }}
      >
        <button type="button" onClick={() => addComments(1)}>
          1レス追加
        </button>
        <button type="button" onClick={() => addComments(20)}>
          20レス追加
        </button>
        <button type="button" onClick={updateSettings}>
          表示設定を更新
        </button>
        <span>Memory event bus / Browser platform</span>
      </div>
      <OverlayApp eventBus={eventBus} platform={platform} />
    </div>
  );
}

export const EventPreview: Story = {
  render: () => <OverlayAppPreview />,
};
