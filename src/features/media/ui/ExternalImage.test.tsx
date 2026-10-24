import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }));
vi.mock("src/app/logger", () => ({ createLogger: () => loggerMock }));

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
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:tauri-image");
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

  it("同じURLへ戻っても前の表示の取得結果を新画像へ混ぜない", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    const resolves: Array<(response: ReturnType<typeof imageResponse>) => void> = [];
    fetchTauriBinaryMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolves.push(resolve);
        }),
    );
    createObjectUrl
      .mockReturnValueOnce("blob:old-a")
      .mockReturnValueOnce("blob:new-a")
      .mockReturnValueOnce("blob:old-b");
    const { rerender, unmount } = render(<ExternalImage src={imageUrl} alt="テスト画像" />);
    const image = screen.getByRole("img", { name: "テスト画像" });
    fireEvent.error(image);
    rerender(<ExternalImage src="https://images.example.com/next.jpg" alt="テスト画像" />);
    fireEvent.error(image);
    rerender(<ExternalImage src={imageUrl} alt="テスト画像" />);
    fireEvent.error(image);
    expect(resolves).toHaveLength(3);
    await act(async () => {
      resolves[0](imageResponse());
    });
    expect(image).not.toHaveAttribute("src");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:old-a");
    await act(async () => {
      resolves[2](imageResponse());
    });
    expect(image).toHaveAttribute("src", "blob:new-a");
    await act(async () => {
      resolves[1](imageResponse());
    });
    expect(image).toHaveAttribute("src", "blob:new-a");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:old-b");
    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:new-a");
  });

  it("取得後のblobを表示できない場合は最終エラーを一度だけ通知する", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    fetchTauriBinaryMock.mockResolvedValue(imageResponse());
    const onError = vi.fn();
    render(<ExternalImage src={imageUrl} alt="テスト画像" onError={onError} />);
    const image = screen.getByRole("img", { name: "テスト画像" });
    fireEvent.error(image);
    await waitFor(() => expect(image).toHaveAttribute("src", "blob:tauri-image"));
    fireEvent.error(image);
    fireEvent.error(image);
    expect(onError).toHaveBeenCalledOnce();
    expect(fetchTauriBinaryMock).toHaveBeenCalledOnce();
  });
});
