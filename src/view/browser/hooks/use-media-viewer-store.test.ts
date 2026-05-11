import { useMediaViewerStore } from "src/view/browser/hooks/use-media-viewer-store";
import { beforeEach, describe, expect, it } from "vitest";

describe("useMediaViewerStore", () => {
  beforeEach(() => {
    useMediaViewerStore.setState({
      viewer: null,
      viewerScale: 1,
    });
  });

  it("closeViewer でビューアを閉じる時にズーム倍率を等倍へリセットする", () => {
    useMediaViewerStore.setState({
      viewer: {
        src: "https://example.com/image.jpg",
        label: "https://example.com/image.jpg",
      },
      viewerScale: 2.5,
    });

    useMediaViewerStore.getState().closeViewer();

    expect(useMediaViewerStore.getState().viewer).toBeNull();
    expect(useMediaViewerStore.getState().viewerScale).toBe(1);
  });
});
