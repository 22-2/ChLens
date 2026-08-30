import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { CommentCandidate } from "src/features/comment-overlay/domain";
import { MemoryCommentOverlayEventBus } from "src/features/comment-overlay/domain";
import { createBrowserCommentOverlayPlatform } from "src/features/comment-overlay/platform/browser";
import { OverlayApp } from "./OverlayApp";

const THREAD_URL = "https://example.test/live/1";

const oldComment: CommentCandidate = {
  responseNumber: 1,
  text: "前回の実況",
  author: "名無し",
};

const restartedComment: CommentCandidate = {
  responseNumber: 1,
  text: "再開後の実況",
  author: "名無し",
};

describe("OverlayApp", () => {
  let scheduledFrame: FrameRequestCallback | null;

  beforeEach(() => {
    scheduledFrame = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("同じスレッドのresetでも前回のコメントを消し、再開後の同じ番号を受け入れる", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    const platform = createBrowserCommentOverlayPlatform();

    render(<OverlayApp eventBus={eventBus} platform={platform} />);

    // 非同期subscribeが完了してからeventを投入し、Tauriの購読開始後の境界を再現する。
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await eventBus.publish({
        version: 1,
        type: "batch",
        batch: {
          threadUrl: THREAD_URL,
          comments: [oldComment],
          latestResponseNumber: 1,
        },
      });
    });
    act(() => {
      scheduledFrame?.(0);
    });

    expect(screen.getByText("前回の実況")).toBeVisible();

    await act(async () => {
      await eventBus.publish({
        version: 1,
        type: "reset",
        batch: {
          threadUrl: THREAD_URL,
          comments: [],
          latestResponseNumber: 1,
        },
      });
    });

    expect(screen.queryByText("前回の実況")).not.toBeInTheDocument();

    await act(async () => {
      await eventBus.publish({
        version: 1,
        type: "batch",
        batch: {
          threadUrl: THREAD_URL,
          comments: [restartedComment],
          latestResponseNumber: 1,
        },
      });
    });
    act(() => {
      scheduledFrame?.(0);
    });

    expect(screen.getByText("再開後の実況")).toBeVisible();
  });
});
