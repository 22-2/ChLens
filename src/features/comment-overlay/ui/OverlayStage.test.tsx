import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(activeComment).not.toHaveAttribute("style", positionWhilePlaying);
    expect(activeComment.style.animationPlayState).toBe("paused");
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

    expect(screen.getByText("テストコメント").style.left).toBe("600px");
  });

  it("interactive時はhoverでコメント単位を停止し、情報を表示する", () => {
    render(
      <OverlayStage
        comments={[{ ...comment, id: "abc", date: "2026/08/30" }]}
        stageWidth={600}
        stageHeight={32}
        laneHeight={32}
        playing
      />,
    );

    act(() => {
      scheduledFrame?.(0);
    });
    const activeComment = screen.getByText("テストコメント");

    fireEvent.mouseEnter(activeComment);

    expect(activeComment).toHaveAttribute("data-paused", "true");
    expect(screen.getByRole("tooltip")).toHaveTextContent("レス1");
    expect(screen.getByRole("tooltip")).toHaveTextContent("ID: abc");

    fireEvent.mouseLeave(activeComment);

    expect(activeComment).toHaveAttribute("data-paused", "false");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
