import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { CommentCandidate } from "../domain/comment-types";
import { OverlayStage } from "./OverlayStage";

const comment: CommentCandidate = {
  responseNumber: 1,
  text: "テストコメント",
  author: "名無し",
};

describe("OverlayStage", () => {
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

  it("初回frameでqueueしたコメントを表示する", () => {
    render(
      <OverlayStage
        comments={[comment]}
        stageWidth={600}
        stageHeight={32}
        laneHeight={32}
        playing
      />,
    );

    expect(screen.getByTestId("comment-overlay-stage")).toHaveAttribute("data-active-count", "0");

    act(() => {
      scheduledFrame?.(0);
    });

    expect(screen.getByText("テストコメント")).toBeVisible();
    expect(screen.getByTestId("comment-overlay-stage")).toHaveAttribute("data-active-count", "1");
  });

  it("停止中は時刻を進めず最後の表示位置を保持する", () => {
    const { rerender } = render(
      <OverlayStage
        comments={[comment]}
        stageWidth={600}
        stageHeight={32}
        laneHeight={32}
        playing
      />,
    );

    act(() => {
      scheduledFrame?.(0);
    });
    const stage = screen.getByTestId("comment-overlay-stage");
    const activeComment = screen.getByText("テストコメント");
    const positionWhilePlaying = activeComment.getAttribute("style");

    rerender(
      <OverlayStage
        comments={[comment]}
        stageWidth={600}
        stageHeight={32}
        laneHeight={32}
        playing={false}
      />,
    );

    expect(stage).toHaveAttribute("data-active-count", "1");
    expect(activeComment).toHaveAttribute("style", positionWhilePlaying);
  });

  it("親サイズの初回測定が0pxでもfallback幅でコメントを開始する", () => {
    class ResizeObserverStub {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    render(
      <OverlayStage
        comments={[comment]}
        stageWidth={600}
        stageHeight={120}
        laneHeight={32}
        fitToContainer
        playing
      />,
    );

    act(() => {
      scheduledFrame?.(0);
    });

    expect(screen.getByText("テストコメント").style.transform).toContain("600px");
  });
});
