import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ExternalMediaEmbed } from "src/core/util/external-media";
import { getDirectVideoFallbackThumbnailUrl } from "src/core/util/external-media";
import type { ExternalImageProps } from "src/features/media/ui/ExternalImage";
import type { NativeVideoMediaItem } from "src/features/media/ui/res-media-items";
import { NativeVideoThumb, VideoThumbImage } from "src/features/media/ui/VideoThumbs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

// サムネイルの取得は ExternalImage の責務なので、ここでは img の読み込み結果だけを流す。
vi.mock("src/features/media/ui/ExternalImage", async () => {
  const React = await import("react");
  return {
    ExternalImage: (props: ExternalImageProps) =>
      React.createElement("img", {
        src: props.src,
        alt: props.alt ?? "",
        onError: props.onError,
      }),
  };
});

const THUMBNAIL_URL = "https://img.example.com/primary.jpg";
const FALLBACK_THUMBNAIL_URL = "https://img.example.com/fallback.jpg";
const NEXT_THUMBNAIL_URL = "https://img.example.com/next.jpg";

function createEmbed(thumbnailUrl: string): ExternalMediaEmbed {
  return {
    providerLabel: "動画サイト",
    thumbnailUrl,
    fallbackThumbnailUrl: FALLBACK_THUMBNAIL_URL,
  } as ExternalMediaEmbed;
}

function createNativeVideo(): NativeVideoMediaItem {
  return {
    type: "nativeVideo",
    rawUrl: "https://video.example.com/clip.mp4",
    srcUrl: "https://video.example.com/clip.mp4",
    providerLabel: "MP4",
  };
}

describe("VideoThumbImage", () => {
  afterEach(() => {
    cleanup();
  });

  it("手動取得の設定では、画像を読み込まずに動画を展開する案内を出す", () => {
    render(<VideoThumbImage embed={createEmbed(THUMBNAIL_URL)} manualImageLoading />);

    expect(screen.getByText("クリックして動画を展開")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("通常時は、動画サイトのサムネイルを表示する", () => {
    render(<VideoThumbImage embed={createEmbed(THUMBNAIL_URL)} manualImageLoading={false} />);

    const image = screen.getByRole("img", { name: "動画サイト のサムネイル" });
    expect(image).toHaveAttribute("src", THUMBNAIL_URL);
  });

  it("サムネイルの読み込みに失敗したら、予備のサムネイルへ切り替える", () => {
    render(<VideoThumbImage embed={createEmbed(THUMBNAIL_URL)} manualImageLoading={false} />);

    fireEvent.error(screen.getByRole("img", { name: "動画サイト のサムネイル" }));

    expect(screen.getByRole("img", { name: "動画サイト のサムネイル" })).toHaveAttribute(
      "src",
      FALLBACK_THUMBNAIL_URL,
    );
  });

  it("予備のサムネイルも失敗しても、それ以上は切り替えない", () => {
    render(<VideoThumbImage embed={createEmbed(THUMBNAIL_URL)} manualImageLoading={false} />);

    fireEvent.error(screen.getByRole("img", { name: "動画サイト のサムネイル" }));
    fireEvent.error(screen.getByRole("img", { name: "動画サイト のサムネイル" }));

    expect(screen.getByRole("img", { name: "動画サイト のサムネイル" })).toHaveAttribute(
      "src",
      FALLBACK_THUMBNAIL_URL,
    );
  });

  it("動画が変わると、前の動画のサムネイルを引き継がず新しいサムネイルに変える", () => {
    const { rerender } = render(
      <VideoThumbImage embed={createEmbed(THUMBNAIL_URL)} manualImageLoading={false} />,
    );
    fireEvent.error(screen.getByRole("img", { name: "動画サイト のサムネイル" }));

    rerender(
      <VideoThumbImage embed={createEmbed(NEXT_THUMBNAIL_URL)} manualImageLoading={false} />,
    );

    expect(screen.getByRole("img", { name: "動画サイト のサムネイル" })).toHaveAttribute(
      "src",
      NEXT_THUMBNAIL_URL,
    );
  });
});

describe("NativeVideoThumb", () => {
  afterEach(() => {
    cleanup();
  });

  it("手動取得の設定では、動画の読み込みを待つ案内を出す", () => {
    render(<NativeVideoThumb video={createNativeVideo()} manualImageLoading />);

    expect(screen.getByText("クリックして動画を展開")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("通常時は予備のサムネイルを表示し、動画のURLを再生用に設定する", () => {
    const { container } = render(
      <NativeVideoThumb video={createNativeVideo()} manualImageLoading={false} />,
    );

    expect(screen.getByRole("img", { name: "動画サムネイル" })).toHaveAttribute(
      "src",
      getDirectVideoFallbackThumbnailUrl(),
    );
    const video = container.querySelector("video");
    expect(video).toHaveAttribute("src", "https://video.example.com/clip.mp4");
    expect(video).toHaveAttribute("preload", "none");
  });

  it("動画の最初のフレームが読み込めると、予備のサムネイルを消して動画を表示する", () => {
    const { container } = render(
      <NativeVideoThumb video={createNativeVideo()} manualImageLoading={false} />,
    );
    const video = container.querySelector("video");
    if (!video) throw new Error("動画要素が描画されていません");

    fireEvent.loadedData(video);

    expect(screen.queryByRole("img", { name: "動画サムネイル" })).not.toBeInTheDocument();
    expect(video).toHaveClass("res__thumb-video-preview--ready");
  });
});
