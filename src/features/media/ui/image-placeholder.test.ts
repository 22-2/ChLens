import { waitFor } from "@testing-library/react";
import type {
  MediaImageState,
  MediaImageStatus,
} from "src/features/media/browser/use-media-image-store";
import {
  getImagePlaceholderLabel,
  getImagePlaceholderText,
  isImageLoadStarted,
  requestImageDownload,
} from "src/features/media/ui/image-placeholder";
import { describe, expect, it, vi } from "vite-plus/test";

const { requestMediaImageDownloadMock, loggerError } = vi.hoisted(() => ({
  requestMediaImageDownloadMock: vi.fn<(key: string, url: string) => Promise<void>>(),
  loggerError: vi.fn(),
}));
vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: loggerError, warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock("../browser/image-download-preflight", () => ({
  requestMediaImageDownload: requestMediaImageDownloadMock,
}));

const IMAGE_URL = "https://images.example.com/photo.png";
const DEFAULT_LABEL = "画像を表示";

function createImageState(overrides: Partial<MediaImageState> = {}): MediaImageState {
  return { status: "requested", version: 1, fallbackSrc: null, ...overrides };
}

describe("requestImageDownload", () => {
  it("画像のURLを取得対象として、事前確認を依頼する", () => {
    requestMediaImageDownloadMock.mockResolvedValue(undefined);

    requestImageDownload(IMAGE_URL);

    expect(requestMediaImageDownloadMock).toHaveBeenCalledWith(IMAGE_URL, IMAGE_URL);
  });

  it("事前確認に失敗したら、URLと原因をログに残す", async () => {
    const error = new Error("確認できません");
    requestMediaImageDownloadMock.mockRejectedValue(error);

    requestImageDownload(IMAGE_URL);

    await waitFor(() => {
      expect(loggerError).toHaveBeenCalledWith("画像取得の事前確認に失敗しました", {
        url: IMAGE_URL,
        error,
      });
    });
  });
});

describe("getImagePlaceholderText", () => {
  it("状態がまだ無いときは、クリックして取得する旨を返す", () => {
    expect(getImagePlaceholderText(undefined)).toBe("クリックして画像を取得");
  });

  it("削除された画像は、削除されたことを返す", () => {
    expect(getImagePlaceholderText(createImageState({ status: "discarded" }))).toBe(
      "削除されました",
    );
  });

  it("サイズを確認中の画像は、確認中であることを返す", () => {
    expect(getImagePlaceholderText(createImageState({ status: "checking" }))).toBe(
      "画像サイズを確認中...",
    );
  });

  it("サイズが分からない確認待ちの画像は、サイズを確認できないことを返す", () => {
    const state = createImageState({ status: "awaiting-confirmation", contentLength: null });

    expect(getImagePlaceholderText(state)).toBe("サイズを確認できません。クリックして確認");
  });

  it("サイズが分かる確認待ちの画像は、MB単位の小数2桁でサイズを返す", () => {
    const state = createImageState({
      status: "awaiting-confirmation",
      contentLength: 2_500_000,
    });

    expect(getImagePlaceholderText(state)).toBe("画像サイズ 2.50 MB・クリックして確認");
  });

  it("取得が始まった画像は、既定の文言を返す", () => {
    expect(getImagePlaceholderText(createImageState({ status: "loaded" }))).toBe(
      "クリックして画像を取得",
    );
  });
});

describe("getImagePlaceholderLabel", () => {
  it("状態がまだ無いときは、呼び出し側の既定ラベルを返す", () => {
    expect(getImagePlaceholderLabel(undefined, DEFAULT_LABEL)).toBe(DEFAULT_LABEL);
  });

  it("削除された画像は、削除されたことを返す", () => {
    expect(getImagePlaceholderLabel(createImageState({ status: "discarded" }), DEFAULT_LABEL)).toBe(
      "削除されました",
    );
  });

  it("サイズを確認中の画像は、末尾の省略記号を付けずに確認中であることを返す", () => {
    expect(getImagePlaceholderLabel(createImageState({ status: "checking" }), DEFAULT_LABEL)).toBe(
      "画像サイズを確認中",
    );
  });

  it("確認待ちの画像は、操作の文言と同じ内容を返す", () => {
    const state = createImageState({ status: "awaiting-confirmation", contentLength: 1_000_000 });

    expect(getImagePlaceholderLabel(state, DEFAULT_LABEL)).toBe(getImagePlaceholderText(state));
  });

  it("取得中の画像は、呼び出し側の既定ラベルを返す", () => {
    expect(getImagePlaceholderLabel(createImageState({ status: "requested" }), DEFAULT_LABEL)).toBe(
      DEFAULT_LABEL,
    );
  });
});

describe("isImageLoadStarted", () => {
  it.each<[MediaImageStatus | undefined, boolean]>([
    [undefined, false],
    ["checking", false],
    ["awaiting-confirmation", false],
    ["requested", true],
    ["loaded", true],
    ["discarded", false],
  ])("状態 %s の読み込み開始判定は %s", (status, expected) => {
    expect(isImageLoadStarted(status)).toBe(expected);
  });
});
