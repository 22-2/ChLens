import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { CommentCandidate } from "../domain/comment-types";
import {
  calculateCommentLaneHeight,
  calculateOverlayDisplayScale,
  COMMENT_OVERLAY_FONT_SIZE,
  estimateCommentWidth,
  normalizeCommentOverlayText,
  OverlayStage,
} from "./OverlayStage";

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

  it("文字サイズに合わせてlane高を計算する", () => {
    expect(calculateCommentLaneHeight(30)).toBe(40);
    expect(calculateCommentLaneHeight(48)).toBe(62);
  });

  it("改行を空白へ変換して一行表示にする", () => {
    expect(normalizeCommentOverlayText("一行\n二行\r\n三行")).toBe("一行 二行 三行");
  });

  it("一行化後の全体幅でコメント速度を見積もる", () => {
    expect(estimateCommentWidth({ ...comment, text: "123\n456" }, 10)).toBeCloseTo(76.5);
  });

  it("基準サイズに対する短い側の比率で表示倍率を計算する", () => {
    expect(calculateOverlayDisplayScale(1_800, 240, 900, 160)).toBe(1.5);
    expect(calculateOverlayDisplayScale(450, 160, 900, 160)).toBe(0.5);
  });

  it("上部paddingをレーン位置へ反映する", () => {
    render(
      <OverlayStage
        comments={[comment]}
        stageWidth={600}
        stageHeight={120}
        topPadding={40}
        durationSeconds={6}
        playing
      />,
    );

    act(() => {
      scheduledFrame?.(0);
    });

    expect(screen.getByText("テストコメント")).toHaveStyle({ top: "40px" });
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

  it("画像と自分のレス状態を流れるコメントへ描画する", () => {
    const { container } = render(
      <OverlayStage
        comments={[
          {
            ...comment,
            text: "画像付きレス",
            imageUrls: ["https://example.com/image.jpg"],
            isOwn: true,
          },
        ]}
        stageWidth={600}
        stageHeight={120}
        laneHeight={32}
        playing
      />,
    );

    act(() => {
      scheduledFrame?.(0);
    });

    const image = container.querySelector<HTMLImageElement>(".comment-overlay-stage__media");
    expect(image).toHaveAttribute("src", "https://example.com/image.jpg");
    expect(image?.parentElement).toHaveClass("comment-overlay-stage__comment--own");
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

  it("リサイズ時はフォントを拡大し、表示中コメントを現在の進捗から流し続ける", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    class ResizeObserverStub {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    render(
      <OverlayStage
        comments={[comment]}
        stageWidth={600}
        stageHeight={120}
        durationSeconds={6}
        fitToContainer
        scaleToContainer
        playing
      />,
    );
    act(() => {
      scheduledFrame?.(0);
      scheduledFrame?.(3_000);
    });

    act(() => {
      resizeCallback?.(
        [{ contentRect: { width: 1_200, height: 240 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });

    const activeComment = screen.getByText("テストコメント");
    expect(activeComment.style.fontSize).toBe(`${COMMENT_OVERLAY_FONT_SIZE * 2}px`);
    expect(activeComment.style.animationDelay).toBe("-3s");
  });

  it("native実寸の変更ではschedulerを作り直さず進捗を保つ", () => {
    const { rerender } = render(
      <OverlayStage
        comments={[comment]}
        stageWidth={900}
        stageHeight={506}
        containerWidth={900}
        containerHeight={506}
        durationSeconds={6}
        scaleToContainer
        playing
      />,
    );
    act(() => {
      scheduledFrame?.(0);
      scheduledFrame?.(3_000);
    });

    rerender(
      <OverlayStage
        comments={[comment]}
        stageWidth={900}
        stageHeight={506}
        containerWidth={1_800}
        containerHeight={1_012}
        durationSeconds={6}
        scaleToContainer
        playing
      />,
    );

    const activeComment = screen.getByText("テストコメント");
    expect(activeComment.style.fontSize).toBe(`${COMMENT_OVERLAY_FONT_SIZE * 2}px`);
    expect(activeComment.style.animationDelay).toBe("-3s");
  });

  it("ホバーやフォーカスでは流れ続け、右クリックで停止してメニューを閉じると再開する", () => {
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
    fireEvent.focus(activeComment);

    expect(activeComment).toHaveAttribute("data-paused", "false");
    expect(activeComment.style.animationPlayState).toBe("running");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.contextMenu(activeComment);

    expect(activeComment).toHaveAttribute("data-paused", "true");
    expect(activeComment.style.animationPlayState).toBe("paused");
    expect(screen.getByRole("tooltip")).toHaveTextContent("レス1");
    expect(screen.getByRole("tooltip")).toHaveTextContent("ID: abc");

    fireEvent.mouseLeave(activeComment);
    fireEvent.blur(activeComment);

    expect(activeComment).toHaveAttribute("data-paused", "true");

    fireEvent.keyDown(activeComment, { key: "Escape" });

    expect(activeComment).toHaveAttribute("data-paused", "false");
    expect(activeComment.style.animationPlayState).toBe("running");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("複数スレの同番号レスは選んだコメントだけ止め、メニューからそのレスへ移動できる", () => {
    const first = {
      ...comment,
      text: "最初のスレ",
      sourceThreadUrl: "https://example.com/thread/1",
    };
    const second = {
      ...comment,
      text: "次のスレ",
      sourceThreadUrl: "https://example.com/thread/2",
    };
    const onCommentJump = vi.fn();
    render(
      <OverlayStage
        comments={[first, second]}
        stageWidth={600}
        stageHeight={64}
        laneHeight={32}
        collisionMode="adaptive"
        onCommentJump={onCommentJump}
      />,
    );
    act(() => scheduledFrame?.(0));

    const firstElement = screen.getByText("最初のスレ");
    const secondElement = screen.getByText("次のスレ");
    fireEvent.mouseEnter(secondElement);
    expect(secondElement).toHaveAttribute("data-paused", "false");

    fireEvent.contextMenu(firstElement);
    expect(firstElement).toHaveAttribute("data-paused", "true");

    fireEvent.contextMenu(secondElement);
    expect(secondElement).toHaveAttribute("data-paused", "true");
    expect(secondElement).toHaveAttribute("data-selected", "true");
    expect(firstElement).toHaveAttribute("data-paused", "false");

    fireEvent.mouseLeave(secondElement);
    expect(secondElement).toHaveAttribute("data-paused", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "このレスへジャンプ" }));
    expect(onCommentJump).toHaveBeenCalledWith(second);
  });

  it("メニュー内の押下では閉じず、表示領域内外の押下で閉じてコメントの停止を解除する", () => {
    render(
      <>
        <button type="button" onPointerDown={(event) => event.stopPropagation()}>
          表示領域の外
        </button>
        <OverlayStage comments={[comment]} />
      </>,
    );
    act(() => scheduledFrame?.(0));
    const activeComment = screen.getByText(comment.text);

    for (const target of [
      screen.getByTestId("comment-overlay-stage"),
      screen.getByRole("button", { name: "表示領域の外" }),
    ]) {
      fireEvent.contextMenu(activeComment);
      expect(activeComment).toHaveAttribute("data-paused", "true");
      fireEvent.pointerDown(screen.getByRole("menuitem", { name: "レスをコピー" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();

      fireEvent.pointerDown(target);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(activeComment).toHaveAttribute("data-paused", "false");
    }
  });

  it("選択中と別のコメントの押下でもメニューを閉じる", () => {
    render(
      <OverlayStage
        comments={[comment, { ...comment, responseNumber: 2, text: "別のコメント" }]}
        collisionMode="adaptive"
      />,
    );
    act(() => scheduledFrame?.(0));
    const activeComment = screen.getByText(comment.text);

    for (const target of [activeComment, screen.getByText("別のコメント")]) {
      fireEvent.contextMenu(activeComment);
      fireEvent.pointerDown(target);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    }
  });

  it("コメントのクリックでメニューを閉じ、既存のクリック処理も実行する", () => {
    const onCommentClick = vi.fn();
    render(<OverlayStage comments={[comment]} onCommentClick={onCommentClick} />);
    act(() => scheduledFrame?.(0));
    const activeComment = screen.getByText(comment.text);
    fireEvent.contextMenu(activeComment);

    fireEvent.click(activeComment);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onCommentClick).toHaveBeenCalledWith(comment);
  });

  it("入力履歴から外れたレス番号を再利用できる", () => {
    const { rerender } = render(
      <OverlayStage
        comments={[{ ...comment, text: "最初のレス" }]}
        stageWidth={600}
        stageHeight={32}
        laneHeight={32}
        playing
      />,
    );

    act(() => {
      scheduledFrame?.(0);
    });

    rerender(
      <OverlayStage
        comments={[{ ...comment, responseNumber: 2, text: "置き換え後のレス" }]}
        stageWidth={600}
        stageHeight={32}
        laneHeight={32}
        playing
      />,
    );
    act(() => {
      scheduledFrame?.(16);
    });

    expect(screen.getByText("置き換え後のレス")).toBeVisible();

    rerender(
      <OverlayStage
        comments={[{ ...comment, text: "再利用したレス" }]}
        stageWidth={600}
        stageHeight={32}
        laneHeight={32}
        playing
      />,
    );
    act(() => {
      scheduledFrame?.(32);
    });

    expect(screen.getByText("再利用したレス")).toBeVisible();
  });
});
