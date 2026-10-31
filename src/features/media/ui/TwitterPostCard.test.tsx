import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ExternalMediaEmbed } from "src/core/util/external-media";
import type { ExternalImageProps } from "src/features/media/ui/ExternalImage";
import { TwitterPostCard, TwitterPostFallback } from "src/features/media/ui/TwitterPostCard";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { translateMock, requestMediaImageDownloadMock, loggerError } = vi.hoisted(() => ({
  translateMock: vi.fn(),
  requestMediaImageDownloadMock: vi.fn<(key: string, url: string) => Promise<void>>(),
  loggerError: vi.fn(),
}));

vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: loggerError, warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock("src/view/browser/hooks/use-config-boolean-setting", () => ({
  useConfigBooleanSetting: () => ({ value: false, setValue: vi.fn() }),
}));
vi.mock("../application/twitter-post", () => ({
  twitterPostResolver: { translate: translateMock },
}));
vi.mock("../browser/image-download-preflight", () => ({
  requestMediaImageDownload: requestMediaImageDownloadMock,
}));

// 画像の取得は ExternalImage の責務なので、ここでは img の読み込み結果だけを流す。
vi.mock("src/features/media/ui/ExternalImage", async () => {
  const React = await import("react");
  return {
    ExternalImage: (props: ExternalImageProps) =>
      React.createElement("img", {
        src: props.src,
        alt: props.alt ?? "",
        className: props.className,
        onLoad: props.onLoad,
        onError: props.onError,
      }),
  };
});

import type { TwitterPost } from "../application/twitter-post";
import { useMediaImageStore } from "../browser/use-media-image-store";

const POST_URL = "https://example.com/post/1";
const IMAGE_URL = "https://images.example.com/photo.png";
const SECOND_IMAGE_URL = "https://images.example.com/second.png";
const SAVE_URL = "https://images.example.com/save.png";
const AVATAR_URL = "https://images.example.com/avatar.png";
const MP4_URL = "https://video.example.com/clip.mp4";
const GIF_URL = "https://video.example.com/loop.mp4";
const POSTER_URL = "https://images.example.com/poster.png";

const EMBED = {
  rawUrl: POST_URL,
  externalUrl: POST_URL,
} as ExternalMediaEmbed;

function createPost(overrides: Partial<TwitterPost> = {}): TwitterPost {
  return {
    id: "1",
    url: POST_URL,
    text: "本文です",
    lang: "ja",
    translation: null,
    createdTimestamp: 1_700_000_000,
    source: "Web App",
    author: {
      name: "テスト投稿者",
      screenName: "example_user",
      avatarUrl: null,
      verificationBadge: null,
    },
    metrics: {
      replies: null,
      reposts: null,
      quotes: null,
      likes: null,
      views: null,
      bookmarks: null,
    },
    media: [],
    ...overrides,
  };
}

type Props = Parameters<typeof TwitterPostCard>[0];

function renderCard(post: TwitterPost, overrides: Partial<Props> = {}) {
  const props: Props = {
    embed: EMBED,
    post,
    manualImageLoading: false,
    resSaveImages: [SAVE_URL],
    onUrlClick: vi.fn(),
    onMiddleMouseDown: vi.fn(),
    onAuxClick: vi.fn(),
    onImageContextMenu: vi.fn(),
    ...overrides,
  };
  const view = render(<TwitterPostCard {...props} />);
  return { ...view, props };
}

function setImageState(url: string, status: "discarded" | "requested") {
  useMediaImageStore.setState({
    images: new Map([[url, { status, version: 1, fallbackSrc: null }]]),
  });
}

describe("TwitterPostCard", () => {
  beforeEach(() => {
    useMediaImageStore.setState({ images: new Map() });
    requestMediaImageDownloadMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("投稿者・本文・出典・投稿日時を表示し、投稿者名は元の投稿へのリンクにする", () => {
    const { container } = renderCard(createPost());

    expect(screen.getByRole("link", { name: "テスト投稿者" })).toHaveAttribute("href", POST_URL);
    expect(screen.getByText("@example_user")).toBeInTheDocument();
    expect(screen.getByText("本文です")).toBeInTheDocument();
    expect(screen.getByText("FxTwitter")).toBeInTheDocument();
    expect(screen.getByText("Web App")).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute(
      "dateTime",
      new Date(1_700_000_000 * 1_000).toISOString(),
    );
  });

  it("認証バッジは、色に応じた名前で支援技術に伝える", () => {
    renderCard(
      createPost({
        author: {
          name: "テスト投稿者",
          screenName: "example_user",
          avatarUrl: null,
          verificationBadge: { color: "gold", type: "organization" },
        },
      }),
    );

    expect(screen.getByRole("img", { name: "金色の認証バッジ" })).toBeInTheDocument();
  });

  it("反応数は値のある項目だけを表示し、0件は表示する", () => {
    const { container } = renderCard(
      createPost({
        metrics: {
          replies: 0,
          reposts: null,
          quotes: null,
          likes: 1_234,
          views: null,
          bookmarks: null,
        },
      }),
    );

    expect(container.querySelector('[data-metric="replies"]')).toHaveAttribute(
      "aria-label",
      "返信 0件",
    );
    expect(container.querySelector('[data-metric="likes"]')).toHaveAttribute(
      "aria-label",
      "いいね 1,234件",
    );
    expect(container.querySelector('[data-metric="likes"]')).toHaveTextContent("1.2K");
    expect(container.querySelector('[data-metric="views"]')).toBeNull();
  });

  it("本文中のURLはリンクにし、それ以外は文字として表示する", () => {
    renderCard(createPost({ text: "見てください https://example.com/article です" }));

    expect(screen.getByRole("link", { name: "https://example.com/article" })).toHaveAttribute(
      "href",
      "https://example.com/article",
    );
    expect(screen.getByText(/見てください/)).toHaveTextContent("見てください");
  });

  it("手動取得の設定で未取得の写真は、読み込み用のボタンを出し、押すと取得を依頼する", () => {
    renderCard(
      createPost({
        media: [{ type: "image", url: IMAGE_URL, altText: "写真の説明" }],
      }),
      { manualImageLoading: true },
    );

    fireEvent.click(screen.getByRole("button", { name: "写真の説明を読み込む" }));

    expect(requestMediaImageDownloadMock).toHaveBeenCalledWith(IMAGE_URL, IMAGE_URL);
  });

  it("削除された写真は、削除された旨をボタンに表示する", () => {
    setImageState(IMAGE_URL, "discarded");
    renderCard(
      createPost({
        media: [{ type: "image", url: IMAGE_URL, altText: "写真の説明" }],
      }),
    );

    expect(screen.getByRole("button", { name: "削除されました" })).toHaveTextContent(
      "削除されました",
    );
  });

  it("手動取得の設定でも、読み込みが始まった写真は画像として表示する", () => {
    setImageState(IMAGE_URL, "requested");
    renderCard(
      createPost({
        media: [{ type: "image", url: IMAGE_URL, altText: "写真の説明" }],
      }),
      { manualImageLoading: true },
    );

    expect(screen.getByRole("img", { name: "写真の説明" })).toHaveAttribute("src", IMAGE_URL);
    expect(screen.queryByRole("button", { name: "写真の説明を読み込む" })).toBeNull();
  });

  it("写真をクリックすると、同じ投稿の写真を並べてビューアで開く", () => {
    const { props } = renderCard(
      createPost({
        media: [
          { type: "image", url: IMAGE_URL, altText: "写真の説明" },
          { type: "image", url: SECOND_IMAGE_URL, altText: "2枚目" },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("link", { name: "写真の説明" }));

    expect(props.onUrlClick).toHaveBeenCalledWith(
      IMAGE_URL,
      [IMAGE_URL, SECOND_IMAGE_URL],
      0,
      undefined,
      [SAVE_URL],
    );
  });

  it("写真の中クリックと補助ボタンの操作は、親の画面へ判断を渡す", () => {
    const { props } = renderCard(
      createPost({
        media: [
          { type: "image", url: IMAGE_URL, altText: "写真の説明" },
          { type: "image", url: SECOND_IMAGE_URL, altText: "2枚目" },
        ],
      }),
    );
    const link = screen.getByRole("link", { name: "写真の説明" });

    fireEvent.mouseDown(link, { button: 1 });
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 1 }));

    expect(props.onMiddleMouseDown).toHaveBeenCalledWith(expect.anything(), IMAGE_URL, [
      IMAGE_URL,
      SECOND_IMAGE_URL,
    ]);
    expect(props.onAuxClick).toHaveBeenCalledWith(expect.anything(), IMAGE_URL, [
      IMAGE_URL,
      SECOND_IMAGE_URL,
    ]);
  });

  it("動画は操作欄を表示し、GIFは自動再生・ループ・ミュートで再生する", () => {
    const { container } = renderCard(
      createPost({
        media: [
          { type: "video", url: MP4_URL, posterUrl: POSTER_URL, isGif: false },
          { type: "video", url: GIF_URL, posterUrl: null, isGif: true },
        ],
      }),
    );
    const [video, gif] = Array.from(container.querySelectorAll("video"));

    // 操作欄は種類によらず表示し、GIFだけを自動再生・ループ・ミュートにする。
    expect(video).toHaveAttribute("poster", POSTER_URL);
    expect(video.controls).toBe(true);
    expect(video.autoplay).toBe(false);
    expect(gif.controls).toBe(true);
    expect(gif.autoplay).toBe(true);
    expect(gif.loop).toBe(true);
    expect(gif.muted).toBe(true);
  });

  it("日本語以外の投稿は翻訳を取得して表示し、原文へ戻せる", async () => {
    translateMock.mockResolvedValue({
      text: "こんにちは",
      sourceLang: "en",
      targetLang: "ja",
    });
    renderCard(createPost({ lang: "en", text: "Hello" }));

    fireEvent.click(screen.getByRole("button", { name: "日本語訳を表示" }));
    expect(await screen.findByText("こんにちは")).toBeInTheDocument();
    expect(translateMock).toHaveBeenCalledWith(POST_URL, "ja");

    fireEvent.click(screen.getByRole("button", { name: "原文を表示" }));
    expect(screen.getByText("Hello")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "日本語訳を表示" }));
    expect(screen.getByText("こんにちは")).toBeInTheDocument();
    expect(translateMock).toHaveBeenCalledTimes(1);
  });

  it("翻訳の取得中は、ボタンを無効にして翻訳中と表示する", async () => {
    let finishTranslation: (value: null) => void = () => {};
    translateMock.mockReturnValue(
      new Promise<null>((resolve) => {
        finishTranslation = resolve;
      }),
    );
    renderCard(createPost({ lang: "en", text: "Hello" }));

    fireEvent.click(screen.getByRole("button", { name: "日本語訳を表示" }));

    const pending = screen.getByRole("button", { name: "翻訳中…" });
    expect(pending).toBeDisabled();

    await act(async () => finishTranslation(null));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "日本語訳を表示" })).toBeEnabled();
    });
  });

  it("翻訳に失敗したら、その旨を状態として知らせる", async () => {
    translateMock.mockResolvedValue(null);
    renderCard(createPost({ lang: "en", text: "Hello" }));

    fireEvent.click(screen.getByRole("button", { name: "日本語訳を表示" }));

    expect(await screen.findByRole("status")).toHaveTextContent("日本語訳を取得できませんでした");
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("日本語の投稿には、翻訳のボタンを出さない", () => {
    renderCard(createPost({ lang: "ja-JP", text: "本文です" }));

    expect(screen.queryByRole("button", { name: "日本語訳を表示" })).toBeNull();
  });

  it("言語が分からない投稿には、翻訳のボタンを出さない", () => {
    renderCard(createPost({ lang: null, text: "本文です" }));

    expect(screen.queryByRole("button", { name: "日本語訳を表示" })).toBeNull();
  });

  it("日本語訳が添付された投稿は、最初から訳文を表示し、翻訳の取得はしない", () => {
    renderCard(
      createPost({
        lang: "en",
        text: "Hello",
        translation: { text: "訳文", sourceLang: "en", targetLang: "ja" },
      }),
    );

    expect(screen.getByText("訳文")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "原文を表示" })).toBeInTheDocument();
    expect(translateMock).not.toHaveBeenCalled();
  });

  it("日本語以外の訳文は使わず、原文を表示して翻訳できる状態にする", () => {
    renderCard(
      createPost({
        lang: "en",
        text: "Hello",
        translation: { text: "Bonjour", sourceLang: "en", targetLang: "fr" },
      }),
    );

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日本語訳を表示" })).toBeInTheDocument();
  });

  it("手動取得の設定で未取得の投稿者の画像は、読み込み用のボタンを出し、押すと取得を依頼する", () => {
    renderCard(
      createPost({
        author: {
          name: "テスト投稿者",
          screenName: "example_user",
          avatarUrl: AVATAR_URL,
          verificationBadge: null,
        },
      }),
      { manualImageLoading: true },
    );

    fireEvent.click(screen.getByRole("button", { name: "投稿者の画像を読み込む" }));

    expect(requestMediaImageDownloadMock).toHaveBeenCalledWith(AVATAR_URL, AVATAR_URL);
  });

  it("投稿を開くリンクは、元の投稿を新しいタブで開く", () => {
    renderCard(createPost());

    const link = screen.getByRole("link", { name: "Xで投稿を開く" });
    expect(link).toHaveAttribute("href", POST_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("TwitterPostFallback", () => {
  afterEach(() => {
    cleanup();
  });

  it("取得中は取得中の文言を出す", () => {
    render(<TwitterPostFallback embed={EMBED} isLoading />);

    expect(screen.getByText("FxTwitterから投稿を取得しています…")).toBeInTheDocument();
  });

  it("取得できなかったときは、失敗の文言と元の投稿を開くリンクを出す", () => {
    render(<TwitterPostFallback embed={EMBED} isLoading={false} />);

    expect(screen.getByText("FxTwitterから投稿を取得できませんでした")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "元の投稿を開く" })).toHaveAttribute("href", POST_URL);
  });
});
