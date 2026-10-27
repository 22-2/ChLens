import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }));
vi.mock("src/app/logger", () => ({ createLogger: () => loggerMock }));

const manualImageLoadingMock = vi.hoisted(() => ({ value: false }));
const { requestMediaImageDownloadMock, allowImageWithinCurrentLimitMock } = vi.hoisted(() => ({
  requestMediaImageDownloadMock: vi.fn<(key: string, url: string) => Promise<void>>(),
  allowImageWithinCurrentLimitMock: vi.fn(),
}));
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
  allowImageWithinCurrentLimit: allowImageWithinCurrentLimitMock,
  requestMediaImageDownload: requestMediaImageDownloadMock,
}));

const { fetchTauriBinaryMock, isTauriRuntimeMock } = vi.hoisted(() => ({
  fetchTauriBinaryMock: vi.fn(),
  isTauriRuntimeMock: vi.fn(),
}));

vi.mock("src/app/platform/runtime", () => ({
  isTauriRuntime: isTauriRuntimeMock,
}));

vi.mock("src/app/platform/tauri/HttpClient", () => ({
  fetchTauriBinary: fetchTauriBinaryMock,
}));

import { useMediaImageStore } from "../browser/use-media-image-store";
import { ExternalImage } from "./ExternalImage";

const imageUrl = "https://images.example.com/photo.jpg";

function imageResponse() {
  return {
    status: 200,
    headers: { "content-type": "image/jpeg" },
    body: new ArrayBuffer(4),
    url: imageUrl,
  };
}

describe("ExternalImage", () => {
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cleanup();
    fetchTauriBinaryMock.mockReset();
    isTauriRuntimeMock.mockReset();
    isTauriRuntimeMock.mockReturnValue(false);
    manualImageLoadingMock.value = false;
    useMediaImageStore.setState({ images: new Map() });
    requestMediaImageDownloadMock.mockReset();
    requestMediaImageDownloadMock.mockImplementation((key, url) => {
      useMediaImageStore.getState().requestImage(key, url);
      return Promise.resolve();
    });
    allowImageWithinCurrentLimitMock.mockReset();

    createObjectUrl = vi.fn(() => "blob:tauri-image");
    revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("ブラウザ環境では元のURLをそのまま使う", () => {
    render(<ExternalImage src={imageUrl} alt="テスト画像" />);

    expect(screen.getByRole("img", { name: "テスト画像" })).toHaveAttribute("src", imageUrl);
    expect(fetchTauriBinaryMock).not.toHaveBeenCalled();
  });

  it("手動取得ではプレースホルダーをクリックするまで画像URLを設定しない", () => {
    manualImageLoadingMock.value = true;

    render(<ExternalImage src={imageUrl} alt="テスト画像" />);

    expect(screen.queryByRole("img", { name: "テスト画像" })).toBeNull();
    expect(fetchTauriBinaryMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "画像を読み込む: テスト画像" }));
    expect(screen.getByRole("img", { name: "テスト画像" })).toHaveAttribute("src", imageUrl);
  });

  it("親側で明示的に読み込みを始めた画像は手動設定でも自動取得する", () => {
    manualImageLoadingMock.value = true;

    render(<ExternalImage src={imageUrl} alt="テスト画像" manualLoad={false} />);

    expect(screen.getByRole("img", { name: "テスト画像" })).toHaveAttribute("src", imageUrl);
    expect(screen.queryByRole("button", { name: /画像を読み込む/u })).toBeNull();
  });

  it("Tauri WebViewでの失敗時はHTTPプラグインのblob URLへ切り替える", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    fetchTauriBinaryMock.mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/jpeg" },
      body: new ArrayBuffer(4),
      url: imageUrl,
    });

    const { unmount } = render(<ExternalImage src={imageUrl} alt="テスト画像" />);
    const image = screen.getByRole("img", { name: "テスト画像" });

    fireEvent.error(image);

    await waitFor(() => expect(image).toHaveAttribute("src", "blob:tauri-image"));
    expect(fetchTauriBinaryMock).toHaveBeenCalledWith(
      imageUrl,
      expect.objectContaining({ timeout: 30_000 }),
    );
    expect(createObjectUrl).toHaveBeenCalledOnce();

    unmount();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("同じTauri画像のフォールバック取得結果を複数表示面で共有する", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    fetchTauriBinaryMock.mockResolvedValue(imageResponse());

    render(
      <>
        <ExternalImage src={imageUrl} alt="一枚目" />
        <ExternalImage src={imageUrl} alt="二枚目" />
      </>,
    );
    fireEvent.error(screen.getByRole("img", { name: "一枚目" }));
    fireEvent.error(screen.getByRole("img", { name: "二枚目" }));

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "一枚目" })).toHaveAttribute(
        "src",
        "blob:tauri-image",
      );
      expect(screen.getByRole("img", { name: "二枚目" })).toHaveAttribute(
        "src",
        "blob:tauri-image",
      );
    });
    expect(fetchTauriBinaryMock).toHaveBeenCalledOnce();
  });

  it("親がボタンの場合はサイズ確認中の表示をボタンにせず、クリックを親へ通す", () => {
    const onParentClick = vi.fn();
    useMediaImageStore.getState().beginImageCheck(imageUrl, imageUrl);

    render(
      <button type="button" onClick={onParentClick}>
        <ExternalImage src={imageUrl} alt="テスト画像" insideControl />
      </button>,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByText("画像サイズを確認中..."));
    expect(onParentClick).toHaveBeenCalledOnce();
    expect(requestMediaImageDownloadMock).not.toHaveBeenCalled();
  });

  it("親がボタンの場合でも確認待ちの表示はクリックで確認し、親の操作を止める", () => {
    const onParentClick = vi.fn();
    const version = useMediaImageStore.getState().beginImageCheck(imageUrl, imageUrl)!;
    useMediaImageStore.getState().setImagePreflightResult(imageUrl, imageUrl, version, null, 5);

    render(
      <button type="button" onClick={onParentClick}>
        <ExternalImage src={imageUrl} alt="テスト画像" insideControl />
      </button>,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByText("画像サイズを確認できません。クリックして確認"));
    expect(requestMediaImageDownloadMock).toHaveBeenCalledWith(imageUrl, imageUrl, window);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("取得済み画像を破棄すると表示を隠し、クリックで再取得する", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    fetchTauriBinaryMock.mockResolvedValue(imageResponse());

    render(<ExternalImage src={imageUrl} alt="テスト画像" />);
    const image = screen.getByRole("img", { name: "テスト画像" });
    fireEvent.error(image);
    await waitFor(() => expect(image).toHaveAttribute("src", "blob:tauri-image"));
    fireEvent.load(image);

    expect(useMediaImageStore.getState().images.get(imageUrl)?.status).toBe("loaded");
    act(() => {
      useMediaImageStore.getState().discardImage(imageUrl);
    });

    const deletedPlaceholder = screen.getByRole("button", { name: "削除されました" });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:tauri-image");
    fireEvent.click(deletedPlaceholder);

    const retryImage = screen.getByRole("img", { name: "テスト画像" });
    expect(retryImage).toHaveAttribute("src", imageUrl);
    expect(useMediaImageStore.getState().images.get(imageUrl)?.status).toBe("requested");

    fireEvent.error(retryImage);
    await waitFor(() => expect(retryImage).toHaveAttribute("src", "blob:tauri-image"));
    expect(fetchTauriBinaryMock).toHaveBeenCalledTimes(2);
  });

  it("Tauri側でも失敗した場合は元のonErrorへ通知する", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    fetchTauriBinaryMock.mockRejectedValue(new Error("network failure"));
    const onError = vi.fn();
    loggerMock.error.mockClear();

    render(<ExternalImage src={imageUrl} alt="テスト画像" onError={onError} />);
    fireEvent.error(screen.getByRole("img", { name: "テスト画像" }));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Tauri経由の外部画像取得に失敗しました",
      expect.objectContaining({ url: imageUrl }),
    );
    fireEvent.error(screen.getByRole("img", { name: "テスト画像" }));
    expect(onError).toHaveBeenCalledOnce();
    expect(fetchTauriBinaryMock).toHaveBeenCalledOnce();
  });

  it("空srcやフォールバック待機中のエラーでは親のローディングを解除しない", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    let resolveFetch!: (response: ReturnType<typeof imageResponse>) => void;
    fetchTauriBinaryMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const onError = vi.fn();
    const onLoad = vi.fn();
    render(<ExternalImage src={imageUrl} alt="テスト画像" onError={onError} onLoad={onLoad} />);
    const image = screen.getByRole("img", { name: "テスト画像" });
    fireEvent.error(image);
    expect(image).not.toHaveAttribute("src");
    fireEvent.error(image);
    fireEvent.load(image);
    expect(onError).not.toHaveBeenCalled();
    expect(onLoad).not.toHaveBeenCalled();
    expect(fetchTauriBinaryMock).toHaveBeenCalledOnce();
    await act(async () => {
      resolveFetch(imageResponse());
    });
    expect(image).toHaveAttribute("src", "blob:tauri-image");
    fireEvent.load(image);
    expect(onLoad).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("別画像へ切り替えた後に古いTauri取得結果が表示へ混ざらない", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    const resolves: Array<(response: ReturnType<typeof imageResponse>) => void> = [];
    fetchTauriBinaryMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolves.push(resolve);
        }),
    );
    createObjectUrl.mockReturnValueOnce("blob:old-a").mockReturnValueOnce("blob:new-b");
    const { rerender, unmount } = render(<ExternalImage src={imageUrl} alt="テスト画像" />);
    const image = await screen.findByRole("img", { name: "テスト画像" });
    await waitFor(() =>
      expect(useMediaImageStore.getState().images.get(imageUrl)?.status).toBe("requested"),
    );
    fireEvent.error(image);
    const nextImageUrl = "https://images.example.com/next.jpg";
    rerender(<ExternalImage src={nextImageUrl} alt="テスト画像" />);
    await waitFor(() =>
      expect(useMediaImageStore.getState().images.get(nextImageUrl)?.status).toBe("requested"),
    );
    const nextImage = await screen.findByRole("img", { name: "テスト画像" });
    fireEvent.error(nextImage);
    expect(resolves).toHaveLength(2);
    await act(async () => {
      resolves[0](imageResponse());
    });
    expect(nextImage).not.toHaveAttribute("src", "blob:old-a");
    await act(async () => {
      resolves[1](imageResponse());
    });
    expect(nextImage).toHaveAttribute("src", "blob:new-b");
    expect(useMediaImageStore.getState().images.get(imageUrl)?.fallbackSrc).toBe("blob:old-a");
    unmount();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("取得後のblobを表示できない場合は最終エラーを一度だけ通知する", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    fetchTauriBinaryMock.mockResolvedValue(imageResponse());
    const onError = vi.fn();
    render(<ExternalImage src={imageUrl} alt="テスト画像" onError={onError} />);
    const image = await screen.findByRole("img", { name: "テスト画像" });
    await waitFor(() =>
      expect(useMediaImageStore.getState().images.get(imageUrl)?.status).toBe("requested"),
    );
    fireEvent.error(image);
    await waitFor(() => expect(fetchTauriBinaryMock).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(useMediaImageStore.getState().images.get(imageUrl)?.fallbackSrc).toBe(
        "blob:tauri-image",
      ),
    );
    await waitFor(() => expect(image).toHaveAttribute("src", "blob:tauri-image"));
    fireEvent.error(image);
    fireEvent.error(image);
    expect(onError).toHaveBeenCalledOnce();
    expect(fetchTauriBinaryMock).toHaveBeenCalledOnce();
  });
});
