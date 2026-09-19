import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useMediaViewerStore } from "../browser/use-media-viewer-store";
import { MediaViewerContainer } from "./MediaViewerContainer";

vi.mock("./MediaViewer", () => ({
  MediaViewer: () => <div data-testid="media-viewer" />,
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
});
