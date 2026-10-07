import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useMediaViewerStore } from "../browser/use-media-viewer-store";
import { MediaViewerContainer } from "./MediaViewerContainer";

const mocks = vi.hoisted(() => ({
  openAuxiliaryWindow: vi.fn(),
  createAuxiliaryWindowRoot: vi.fn(),
  popupClose: vi.fn(),
  popup: null as Window | null,
  root: null as HTMLElement | null,
}));

vi.mock("src/features/auxiliary-window/browser/use-auxiliary-window", () => ({
  openAuxiliaryWindow: mocks.openAuxiliaryWindow,
}));

vi.mock("src/features/auxiliary-window/browser/auxiliary-window-root", () => ({
  createAuxiliaryWindowRoot: mocks.createAuxiliaryWindowRoot,
}));

vi.mock("./MediaViewer", () => ({
  MediaViewer: ({
    onDetach,
    onAttach,
    onClose,
    isDetached,
  }: {
    onDetach: () => void;
    onAttach: () => void;
    onClose: () => void;
    isDetached: boolean;
  }) => (
    <div data-testid="media-viewer" data-detached={String(isDetached)}>
      <button type="button" onClick={onDetach}>
        切り離す
      </button>
      <button type="button" onClick={onAttach}>
        戻す
      </button>
      <button type="button" onClick={onClose}>
        閉じる
      </button>
    </div>
  ),
}));

const IMAGE_URL = "https://example.com/image.jpg";

describe("MediaViewerContainer", () => {
  beforeEach(() => {
    useMediaViewerStore.setState({
      viewer: null,
      viewerScopeId: null,
      viewerScale: 1,
      isLoading: false,
    });
    mocks.root = document.createElement("div");
    document.body.appendChild(mocks.root);
    const listeners = new Map<string, EventListener>();
    mocks.popup = {
      closed: false,
      document,
      focus: vi.fn(),
      close: mocks.popupClose,
      addEventListener: vi.fn((type: string, listener: EventListener) =>
        listeners.set(type, listener),
      ),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
      getListeners: () => listeners,
    } as unknown as Window;
    mocks.openAuxiliaryWindow.mockReset();
    mocks.createAuxiliaryWindowRoot.mockReset();
    mocks.popupClose.mockReset();
    mocks.openAuxiliaryWindow.mockReturnValue({ window: mocks.popup, root: mocks.root });
    mocks.createAuxiliaryWindowRoot.mockImplementation(() => {
      const root = document.createElement("div");
      document.body.appendChild(root);
      mocks.root = root;
      return root;
    });
  });

  afterEach(() => {
    cleanup();
    mocks.root?.remove();
    mocks.popup = null;
    mocks.root = null;
  });

  it("所有スレッドのコンテナが破棄されたらビューアーを閉じる", () => {
    useMediaViewerStore.getState().openMediaFromUrl(IMAGE_URL, undefined, "thread-a");

    const { unmount } = render(<MediaViewerContainer scopeId="thread-a" />);
    expect(screen.getByTestId("media-viewer")).toBeInTheDocument();

    unmount();

    expect(useMediaViewerStore.getState().viewer).toBeNull();
  });

  it("別スレッドのコンテナが破棄されてもビューアーを閉じない", () => {
    useMediaViewerStore.getState().openMediaFromUrl(IMAGE_URL, undefined, "thread-a");

    const { unmount } = render(<MediaViewerContainer scopeId="thread-b" />);

    expect(screen.queryByTestId("media-viewer")).toBeNull();
    unmount();

    expect(useMediaViewerStore.getState().viewer).not.toBeNull();
    expect(useMediaViewerStore.getState().viewerScopeId).toBe("thread-a");
  });

  it("画像を切り離すと同じ表示を別窓へ移し、戻すと元の画面へ戻す", () => {
    useMediaViewerStore.getState().openMediaFromUrl(IMAGE_URL, undefined, "thread-a");
    render(<MediaViewerContainer scopeId="thread-a" />);

    fireEvent.click(screen.getByRole("button", { name: "切り離す" }));
    expect(mocks.openAuxiliaryWindow).toHaveBeenCalledTimes(1);
    expect(mocks.openAuxiliaryWindow.mock.calls[0]?.[1]).toBe(window);
    expect(mocks.root).toContainElement(screen.getByTestId("media-viewer"));
    expect(screen.getByTestId("media-viewer")).toHaveAttribute("data-detached", "true");

    fireEvent.click(screen.getByRole("button", { name: "戻す" }));
    expect(mocks.popupClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("media-viewer")).toHaveAttribute("data-detached", "false");
    expect(useMediaViewerStore.getState().viewer?.label).toBe(IMAGE_URL);
  });

  it("ビューアーを閉じると切り離した空窓も閉じる", () => {
    useMediaViewerStore.getState().openMediaFromUrl(IMAGE_URL, undefined, "thread-a");
    render(<MediaViewerContainer scopeId="thread-a" />);
    fireEvent.click(screen.getByRole("button", { name: "切り離す" }));

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(useMediaViewerStore.getState().viewer).toBeNull();
    expect(mocks.popupClose).toHaveBeenCalledTimes(1);
  });

  it("別窓の再読み込みでは画像を元画面へ戻さず新しいrootへ再接続する", () => {
    useMediaViewerStore.getState().openMediaFromUrl(IMAGE_URL, undefined, "thread-a");
    render(<MediaViewerContainer scopeId="thread-a" />);
    fireEvent.click(screen.getByRole("button", { name: "切り離す" }));
    const oldRoot = mocks.root;
    const listeners = (
      mocks.popup as unknown as { getListeners: () => Map<string, EventListener> }
    ).getListeners();

    act(() => listeners.get("load")?.(new Event("load")));

    expect(mocks.createAuxiliaryWindowRoot).toHaveBeenCalledTimes(1);
    expect(mocks.root).not.toBe(oldRoot);
    expect(mocks.root).toContainElement(screen.getByTestId("media-viewer"));
    expect(screen.getByTestId("media-viewer")).toHaveAttribute("data-detached", "true");
    expect(useMediaViewerStore.getState().viewer?.label).toBe(IMAGE_URL);
  });

  it("OS操作で別窓が閉じられたらビューアーを終了し元画面へ戻さない", () => {
    useMediaViewerStore.getState().openMediaFromUrl(IMAGE_URL, undefined, "thread-a");
    render(<MediaViewerContainer scopeId="thread-a" />);
    fireEvent.click(screen.getByRole("button", { name: "切り離す" }));
    Object.defineProperty(mocks.popup, "closed", { configurable: true, value: true });
    const listeners = (
      mocks.popup as unknown as { getListeners: () => Map<string, EventListener> }
    ).getListeners();

    act(() => listeners.get("beforeunload")?.(new Event("beforeunload")));

    expect(useMediaViewerStore.getState().viewer).toBeNull();
    expect(screen.queryByTestId("media-viewer")).toBeNull();
    expect(mocks.popupClose).not.toHaveBeenCalled();
  });
});
