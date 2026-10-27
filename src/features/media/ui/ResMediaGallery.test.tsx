import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const manualImageLoadingMock = vi.hoisted(() => ({ value: false }));
const saveMock = vi.hoisted(() => vi.fn<(url: string, filename: string) => Promise<void>>());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("src/app/platform/DownloadManager", () => ({
  platformDownloadManager: { save: saveMock },
}));
vi.mock("src/view/browser/hooks/use-toast", () => ({ useToast: () => toastMock }));
const requestMediaImageDownloadMock = vi.hoisted(() =>
  vi.fn<(key: string, url: string) => Promise<void>>(),
);
vi.mock("src/view/browser/hooks/use-config-boolean-setting", () => ({
  useConfigBooleanSetting: (key: string) => ({
    value: key === "manual_image_loading" && manualImageLoadingMock.value,
    setValue: vi.fn(),
  }),
}));
vi.mock("src/view/browser/hooks/use-config-number-setting", () => ({
  useConfigNumberSetting: () => ({ value: 5, setValue: vi.fn() }),
}));
vi.mock("../browser/image-download-preflight", () => ({
  allowImageWithinCurrentLimit: vi.fn(),
  requestMediaImageDownload: requestMediaImageDownloadMock,
}));

import { imgurVideoResolver } from "../application/imgur-album";
import { twitterPostResolver } from "../application/twitter-post";
import { useMediaImageStore } from "../browser/use-media-image-store";
import { ResMediaGallery } from "./ResMediaGallery";

beforeEach(() => {
  saveMock.mockReset().mockResolvedValue(undefined);
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  requestMediaImageDownloadMock.mockReset();
  requestMediaImageDownloadMock.mockImplementation((key, url) => {
    useMediaImageStore.getState().requestImage(key, url);
    return Promise.resolve();
  });
});

afterEach(() => {
  cleanup();
  manualImageLoadingMock.value = false;
  useMediaImageStore.setState({ images: new Map() });
});

describe("ResMediaGallery", () => {
  it("同じレスの画像を重複なく元のサイズで保存し、失敗しても残りを保存する", async () => {
    saveMock.mockRejectedValueOnce(new Error("保存できません"));
    render(
      <ResMediaGallery
        urls={[
          "https://imgur.com/Example",
          "https://example.com/photo.png",
          "https://example.com/photo.png",
          "https://example.com/video.mp4",
        ]}
        onUrlClick={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "レスの画像をすべて保存" }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("画像 2 件のうち 1 件を保存できませんでした"),
    );
    expect(saveMock.mock.calls).toEqual([
      ["https://i.imgur.com/Example.jpg", "Example.jpg"],
      ["https://example.com/photo.png", "photo.png"],
    ]);
  });

  it("画像がないレスには保存ボタンを出さない", () => {
    render(<ResMediaGallery urls={["https://example.com/video.mp4"]} onUrlClick={() => {}} />);
    expect(screen.queryByRole("button", { name: "レスの画像をすべて保存" })).toBeNull();
  });
  it("手動取得ではサムネイルをクリックするまで画像を取得しない", () => {
    manualImageLoadingMock.value = true;
    const imageUrl = "https://images.example.com/photo.jpg";
    const onUrlClick = vi.fn();
    render(<ResMediaGallery urls={[imageUrl]} onUrlClick={onUrlClick} />);

    const placeholder = screen.getByRole("button", { name: "画像を読み込む" });
    expect(screen.queryByRole("img", { name: imageUrl })).toBeNull();
    fireEvent.click(placeholder);

    const image = screen.getByRole("img", { name: imageUrl });
    expect(image).toHaveAttribute("src", imageUrl);
    // 読み込み中は「画像を取得中」の表示がリンク名に加わるため、読み込み完了を通知してから操作する。
    fireEvent.load(image);
    expect(onUrlClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: imageUrl }));
    expect(onUrlClick).toHaveBeenCalledWith(imageUrl, [imageUrl], 0);
  });

  it("別のギャラリーでも取得済み状態を共有する", async () => {
    manualImageLoadingMock.value = true;
    const imageUrl = "https://images.example.com/shared-photo.jpg";
    const { container } = render(
      <>
        <ResMediaGallery urls={[imageUrl]} onUrlClick={() => {}} />
        <ResMediaGallery urls={[imageUrl]} onUrlClick={() => {}} />
      </>,
    );

    const placeholders = screen.getAllByRole("button", { name: "画像を読み込む" });
    expect(placeholders).toHaveLength(2);
    fireEvent.click(placeholders[0]);

    await waitFor(() => {
      expect(container.querySelectorAll(`img[alt="${imageUrl}"]`)).toHaveLength(2);
    });
    fireEvent.load(container.querySelector("img") as HTMLImageElement);
    expect(useMediaImageStore.getState().images.get(imageUrl)?.status).toBe("loaded");
  });

  it("取得済み画像の右クリックで破棄し、クリックで再取得する", async () => {
    manualImageLoadingMock.value = true;
    const imageUrl = "https://images.example.com/removable-photo.jpg";
    const { container } = render(
      <>
        <ResMediaGallery urls={[imageUrl]} onUrlClick={() => {}} />
        <ResMediaGallery urls={[imageUrl]} onUrlClick={() => {}} />
      </>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "画像を読み込む" })[0]);
    const images = await waitFor(() => {
      const loadedImages = container.querySelectorAll("img");
      expect(loadedImages).toHaveLength(2);
      return loadedImages;
    });
    fireEvent.load(images[0]);
    fireEvent.contextMenu(screen.getAllByRole("link", { name: imageUrl })[0]);

    fireEvent.click(await screen.findByRole("menuitem", { name: "画像を破棄" }));

    expect(useMediaImageStore.getState().images.get(imageUrl)?.status).toBe("discarded");
    expect(screen.getAllByRole("button", { name: "削除されました" })).toHaveLength(2);
    expect(container.querySelectorAll("img")).toHaveLength(0);

    fireEvent.click(screen.getAllByRole("button", { name: "削除されました" })[0]);
    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
    expect(useMediaImageStore.getState().images.get(imageUrl)?.status).toBe("requested");
  });

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
    expect(container.querySelector(".res__thumb-video-preview")).toHaveAttribute("preload", "none");

    fireEvent.click(container.querySelector(".res__media-embed-close") as HTMLButtonElement);
    expect(container.querySelector(".res__media-embed-player")).toBeNull();
  });

  it("ImgurのMP4直リンクを画像ではなく動画として再生する", () => {
    const rawUrl = "https://i.imgur.com/TestImgurVideo.mp4";
    const { container } = render(<ResMediaGallery urls={[rawUrl]} onUrlClick={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Video を展開する" }));

    expect(container.querySelector(".res__media-embed-player")).toHaveAttribute("src", rawUrl);
  });

  it("拡張子のないImgur共有URLはAPIのMP4情報を使って動画として再生する", async () => {
    const rawUrl = "https://imgur.com/TestImgurVideo";
    const resolve = vi
      .spyOn(imgurVideoResolver, "resolve")
      .mockResolvedValue("https://i.imgur.com/TestImgurVideo.mp4");

    try {
      const { container } = render(<ResMediaGallery urls={[rawUrl]} onUrlClick={() => {}} />);

      expect(resolve).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("link", { name: rawUrl }));
      await screen.findByRole("button", { name: "Video を閉じる" });

      expect(container.querySelector(".res__media-embed-player")).toHaveAttribute(
        "src",
        "https://i.imgur.com/TestImgurVideo.mp4",
      );
      expect(resolve).toHaveBeenCalledWith(rawUrl);
    } finally {
      resolve.mockRestore();
    }
  });

  it("Twitter/X投稿URLをクリックするとFxTwitterの投稿とメディアをレス内へ表示する", async () => {
    const rawUrl = "https://x.com/example/status/1234567890123456789";
    const resolve = vi.spyOn(twitterPostResolver, "resolve").mockResolvedValue({
      id: "1234567890123456789",
      url: rawUrl,
      text: "投稿本文 https://example.com/post-link. https://example.com/second",
      lang: "en",
      translation: null,
      createdTimestamp: 0,
      source: "Twitter Web App",
      author: {
        name: "表示名",
        screenName: "example",
        avatarUrl: null,
        verificationBadge: {
          color: "gold",
          type: "organization",
        },
      },
      metrics: {
        replies: 412,
        reposts: 3300,
        quotes: 17,
        likes: 38600,
        views: 11800000,
        bookmarks: 205,
      },
      media: [
        {
          type: "image",
          url: "https://pbs.twimg.com/media/photo.jpg",
          altText: "写真の説明",
        },
        {
          type: "image",
          url: "https://pbs.twimg.com/media/second-photo.jpg",
          altText: "二枚目の写真",
        },
      ],
    });
    const translate = vi.spyOn(twitterPostResolver, "translate").mockResolvedValue({
      text: "日本語の投稿本文",
      sourceLang: "en",
      targetLang: "ja",
    });

    try {
      const onUrlClick = vi.fn();
      const { container } = render(<ResMediaGallery urls={[rawUrl]} onUrlClick={onUrlClick} />);

      const postButton = screen.getByRole("button", { name: "FxTwitter を展開する" });
      expect(postButton).toHaveClass("res__thumb--post");
      expect(postButton.querySelector(".res__thumb-play")).toBeNull();
      expect(screen.getByText("投稿を表示")).toBeInTheDocument();

      fireEvent.click(postButton);

      await waitFor(() => expect(screen.getByText(/投稿本文/)).toBeInTheDocument());
      expect(container.querySelector(".res__twitter-post")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "https://example.com/post-link" })).toHaveAttribute(
        "href",
        "https://example.com/post-link",
      );
      expect(screen.getByRole("link", { name: "https://example.com/second" })).toHaveAttribute(
        "target",
        "_blank",
      );
      const translationButton = screen.getByRole("button", { name: "日本語訳を表示" });
      expect(translationButton.nextElementSibling).toHaveClass("res__twitter-post-external");
      fireEvent.click(translationButton);
      await waitFor(() => expect(screen.getByText("日本語の投稿本文")).toBeInTheDocument());
      expect(translate).toHaveBeenCalledWith(rawUrl, "ja");
      fireEvent.click(screen.getByRole("button", { name: "原文を表示" }));
      expect(screen.getByText(/投稿本文/)).toBeInTheDocument();
      expect(screen.getByLabelText("金色の認証バッジ")).toBeInTheDocument();
      expect(screen.getByLabelText("返信 412件")).toHaveTextContent("412");
      expect(screen.getByLabelText("リポスト 3,300件")).toHaveTextContent("3.3K");
      expect(screen.getByLabelText("引用 17件")).toBeInTheDocument();
      expect(screen.getByLabelText("いいね 38,600件")).toHaveTextContent("38.6K");
      expect(screen.getByLabelText("閲覧 11,800,000件")).toHaveTextContent("11.8M");
      expect(screen.getByLabelText("ブックマーク 205件")).toBeInTheDocument();
      expect(screen.getByText("Twitter Web App")).toBeInTheDocument();
      expect(container.querySelector("time")).toHaveAttribute(
        "datetime",
        "1970-01-01T00:00:00.000Z",
      );
      expect(screen.getByRole("link", { name: "Xで投稿を開く" })).toHaveAttribute("href", rawUrl);
      expect(resolve).toHaveBeenCalledWith(rawUrl);

      fireEvent.click(screen.getByRole("button", { name: "レスの画像をすべて保存" }));
      await waitFor(() =>
        expect(toastMock.success).toHaveBeenCalledWith("画像を 2 件保存しました"),
      );
      expect(saveMock).toHaveBeenCalledTimes(2);

      fireEvent.click(screen.getByRole("link", { name: "写真の説明" }));
      expect(onUrlClick).toHaveBeenCalledWith(
        "https://pbs.twimg.com/media/photo.jpg",
        ["https://pbs.twimg.com/media/photo.jpg", "https://pbs.twimg.com/media/second-photo.jpg"],
        0,
      );
    } finally {
      resolve.mockRestore();
      translate.mockRestore();
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
