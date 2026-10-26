import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { CommentCandidate } from "../domain/comment-types";
import {
  COMMENT_OVERLAY_IMAGE_BOTTOM_PADDING,
  COMMENT_OVERLAY_IMAGE_HEIGHT,
  COMMENT_OVERLAY_IMAGE_TRAVEL_SECONDS,
  OverlayImageLane,
  removeCompletedOverlayImage,
} from "./OverlayImageLane";

// 変更理由: 既定値を安全側（外部リンク確認・画像の手動取得）へ変えたため、
// リンクや画像の直接表示を前提にした本テストでは両設定を明示的にoffにする。
vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: (key: string) =>
        key === "confirm_external_links" || key === "manual_image_loading" ? "off" : null,
      set: () => {},
      ready: (callback: () => void) => callback(),
    },
    message: { on: () => {}, off: () => {} },
  },
}));

describe("OverlayImageLane", () => {
  afterEach(cleanup);

  it("画像を下部に配置し、右から左へ流れる寸法と速度を設定する", () => {
    const comment: CommentCandidate = {
      responseNumber: 1,
      text: "画像つきコメント",
      author: "名無し",
      imageUrls: ["https://example.test/image.png"],
    };

    render(
      <OverlayImageLane
        comments={[comment]}
        stageWidth={800}
        imageScale={0.3}
        imageOpacity={0.65}
        playing
      />,
    );

    const lane = screen.getByTestId("comment-overlay-image-lane");
    const image = screen.getByTestId("comment-overlay-image");
    expect(lane).toHaveStyle({
      bottom: `${COMMENT_OVERLAY_IMAGE_BOTTOM_PADDING * 0.3}px`,
      height: `${COMMENT_OVERLAY_IMAGE_HEIGHT * 0.3}px`,
    });
    expect(image).toHaveStyle({
      left: "100%",
      width: `${COMMENT_OVERLAY_IMAGE_HEIGHT * 0.3}px`,
      height: `${COMMENT_OVERLAY_IMAGE_HEIGHT * 0.3}px`,
      animationDuration: `${COMMENT_OVERLAY_IMAGE_TRAVEL_SECONDS}s`,
      animationPlayState: "running",
      opacity: "0.65",
    });
    expect(image.style.getPropertyValue("--comment-overlay-image-exit-translate")).toBe(
      `-${800 + COMMENT_OVERLAY_IMAGE_HEIGHT * 0.3}px`,
    );

    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1920 },
      naturalHeight: { configurable: true, value: 1080 },
    });
    fireEvent.load(image);
    expect(image).toHaveStyle({ width: "160px", height: "90px" });
    expect(image.style.getPropertyValue("--comment-overlay-image-exit-translate")).toBe("-960px");
  });

  it("同じコメントの複数画像を順番に表示し、退出時に次の画像へ進む", () => {
    const comment: CommentCandidate = {
      responseNumber: 2,
      text: "複数画像",
      author: "名無し",
      imageUrls: ["https://example.test/first.png", "https://example.test/second.png"],
    };

    render(
      <OverlayImageLane
        comments={[comment]}
        stageWidth={800}
        imageScale={0.3}
        imageOpacity={1}
        playing
      />,
    );

    const firstImage = screen.getByTestId("comment-overlay-image");
    expect(firstImage).toHaveAttribute("src", "https://example.test/first.png");
    const queue = [
      { key: "first", url: "https://example.test/first.png" },
      { key: "second", url: "https://example.test/second.png" },
    ];
    const nextQueue = removeCompletedOverlayImage(queue);
    expect(nextQueue[0]?.url).toBe("https://example.test/second.png");
    expect(removeCompletedOverlayImage(nextQueue)).toEqual([]);
  });

  it("AA画像を空白と改行を含む代替テキスト付きで読み込み、失敗時に本文へ戻す", () => {
    const comment: CommentCandidate = {
      responseNumber: 4,
      text: "　／￣￣＼\n　|　猫　|\n　＼＿＿／",
      author: "名無し",
      isAA: true,
      asciiArtImageUrl: "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E",
    };

    render(
      <OverlayImageLane
        comments={[comment]}
        stageWidth={800}
        imageScale={0.3}
        imageOpacity={1}
        playing
      />,
    );

    const image = screen.getByTestId("comment-overlay-aa-image");
    expect(image).toHaveAttribute("alt", comment.text);
    fireEvent.error(image);
    expect(screen.getByTestId("comment-overlay-aa-fallback")).toHaveTextContent("猫");
  });

  it("表示領域の変更に合わせて画像サイズ・距離・速度をスケールする", () => {
    const comment: CommentCandidate = {
      responseNumber: 3,
      text: "画像",
      author: "名無し",
      imageUrls: ["https://example.test/image.png"],
    };

    const { rerender } = render(
      <OverlayImageLane
        comments={[comment]}
        stageWidth={800}
        imageScale={0.3}
        imageOpacity={1}
        playing
      />,
    );
    rerender(
      <OverlayImageLane
        comments={[comment]}
        stageWidth={400}
        imageScale={0.2}
        imageOpacity={0.65}
        playing={false}
      />,
    );

    const image = screen.getByTestId("comment-overlay-image");
    expect(screen.getByTestId("comment-overlay-image-lane")).toHaveStyle({ height: "60px" });
    expect(image).toHaveStyle({
      width: "60px",
      height: "60px",
      animationDuration: `${COMMENT_OVERLAY_IMAGE_TRAVEL_SECONDS}s`,
      animationPlayState: "paused",
      opacity: "0.65",
    });
    expect(image.style.getPropertyValue("--comment-overlay-image-exit-translate")).toBe("-460px");
  });
});
