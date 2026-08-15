import { useMediaViewerStore } from "src/view/browser/hooks/use-media-viewer-store";
import { beforeEach, describe, expect, it } from "vite-plus/test";

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

  it("ツールバーから従来の上限を超えて拡大できる", () => {
    useMediaViewerStore.setState({ viewerScale: 5 });

    useMediaViewerStore.getState().zoomIn();

    expect(useMediaViewerStore.getState().viewerScale).toBe(5.25);
  });

  it("ツールバー操作の拡大倍率を10倍に制限する", () => {
    useMediaViewerStore.setState({ viewerScale: 10 });

    useMediaViewerStore.getState().zoomIn();

    expect(useMediaViewerStore.getState().viewerScale).toBe(10);
  });

  it("ホイール操作の拡大倍率を10倍に制限する", () => {
    useMediaViewerStore.setState({ viewerScale: 9.75 });

    useMediaViewerStore.getState().zoomByWheel(-120);

    expect(useMediaViewerStore.getState().viewerScale).toBe(10);
  });
});
