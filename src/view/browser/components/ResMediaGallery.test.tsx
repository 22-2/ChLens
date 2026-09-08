import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResMediaGallery } from "src/view/browser/components/ResMediaGallery";
import { twitterPostResolver } from "src/view/browser/utils/twitter-post";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  cleanup();
});

describe("ResMediaGallery", () => {
  it("YouTube サムネイルをクリックするとレス内 iframe を開く", () => {
    const onUrlClick = vi.fn();
    render(<ResMediaGallery urls={["https://youtu.be/TestVideo01"]} onUrlClick={onUrlClick} />);

    fireEvent.click(screen.getByRole("button", { name: "YouTube を展開する" }));

    const frame = screen.getByTitle("YouTube 動画プレーヤー");
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveAttribute("src", expect.stringContaining("youtube.com/embed/TestVideo01"));
    expect(onUrlClick).not.toHaveBeenCalled();
  });

  it("直リンク動画をクリックするとレス内 video を開閉する", () => {
    const rawUrl =
      "https://video.twimg.com/amplify_video/0000000000000000000/vid/avc1/1280x720/test-video.mp4?tag=14";
    const { container } = render(<ResMediaGallery urls={[rawUrl]} onUrlClick={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Twitter Video を展開する" }));

    const player = container.querySelector(".res__media-embed-player") as HTMLVideoElement;
    expect(player).toBeInTheDocument();
    expect(player).toHaveAttribute("src", rawUrl);

    fireEvent.click(container.querySelector(".res__media-embed-close") as HTMLButtonElement);
    expect(container.querySelector(".res__media-embed-player")).toBeNull();
  });

  it("Twitter/X投稿URLをクリックするとFxTwitterの投稿とメディアをレス内へ表示する", async () => {
    const rawUrl = "https://x.com/example/status/1234567890123456789";
    const resolve = vi.spyOn(twitterPostResolver, "resolve").mockResolvedValue({
      id: "1234567890123456789",
      url: rawUrl,
      text: "投稿本文",
      author: {
        name: "表示名",
        screenName: "example",
        avatarUrl: null,
      },
      media: [
        {
          type: "image",
          url: "https://pbs.twimg.com/media/photo.jpg",
          altText: "写真の説明",
        },
      ],
    });

    try {
      const { container } = render(<ResMediaGallery urls={[rawUrl]} onUrlClick={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: "FxTwitter を展開する" }));

      await waitFor(() => expect(screen.getByText("投稿本文")).toBeInTheDocument());
      expect(container.querySelector(".res__twitter-post")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Xで投稿を開く" })).toHaveAttribute("href", rawUrl);
      expect(resolve).toHaveBeenCalledWith(rawUrl);
    } finally {
      resolve.mockRestore();
    }
  });

  it("FxTwitter取得失敗時は元の投稿URLを開くリンクを表示する", async () => {
    const rawUrl = "https://twitter.com/example/status/1234567890123456789";
    const resolve = vi.spyOn(twitterPostResolver, "resolve").mockResolvedValue(null);

    try {
      render(<ResMediaGallery urls={[rawUrl]} onUrlClick={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: "FxTwitter を展開する" }));

      await waitFor(() =>
        expect(screen.getByText("FxTwitterから投稿を取得できませんでした")).toBeInTheDocument(),
      );
      expect(screen.getByRole("link", { name: "元の投稿を開く" })).toHaveAttribute("href", rawUrl);
      expect(resolve).toHaveBeenCalledWith(rawUrl);
    } finally {
      resolve.mockRestore();
    }
  });

  it("popup 用 middle click では mousedown 時点で1回だけ新規タブ扱いにする", () => {
    const rawUrl =
      "https://video.twimg.com/amplify_video/0000000000000000000/vid/avc1/1280x720/test-video.mp4?tag=14";
    const onUrlClick = vi.fn();
    const onMiddleClickStart = vi.fn();

    render(
      <ResMediaGallery
        urls={[rawUrl]}
        onUrlClick={onUrlClick}
        onMiddleClickStart={onMiddleClickStart}
        openOnMiddleMouseDown
      />,
    );

    const thumbButton = screen.getByRole("button", {
      name: "Twitter Video を展開する",
    });
    fireEvent.mouseDown(thumbButton, { button: 1 });
    fireEvent(
      thumbButton,
      new MouseEvent("auxclick", {
        button: 1,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(onUrlClick).toHaveBeenCalledTimes(1);
    expect(onUrlClick).toHaveBeenCalledWith(rawUrl, undefined, 1);
    expect(onMiddleClickStart).toHaveBeenCalledTimes(1);
  });

  it("ぼかし指定時はサムネにぼかしクラスと半径を付ける", () => {
    render(
      <ResMediaGallery
        urls={["https://example.com/image.jpg"]}
        onUrlClick={() => {}}
        isBlurred
        imageBlurRadius={8}
      />,
    );

    const thumb = screen.getByRole("link", {
      name: "https://example.com/image.jpg",
    });

    expect(thumb).toHaveClass("res__thumb--blurred");
    expect(thumb.getAttribute("style")).toContain("--res-thumb-blur-radius: 8px");
  });
});
