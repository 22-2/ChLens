import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useMediaViewerStore } from "./use-media-viewer-store";

describe("useMediaViewerStore", () => {
  beforeEach(() => {
    useMediaViewerStore.setState({
      viewer: null,
      viewerScopeId: null,
      viewerScale: 1,
      isLoading: false,
    });
  });

  it("closeViewer でビューアを閉じる時にズーム倍率を等倍へリセットする", () => {
    useMediaViewerStore.setState({
      viewer: {
        src: "https://example.com/image.jpg",
        label: "https://example.com/image.jpg",
      },
      viewerScopeId: "thread-a",
      viewerScale: 2.5,
      isLoading: true,
    });

    useMediaViewerStore.getState().closeViewer("thread-a");

    expect(useMediaViewerStore.getState().viewer).toBeNull();
    expect(useMediaViewerStore.getState().viewerScopeId).toBeNull();
    expect(useMediaViewerStore.getState().viewerScale).toBe(1);
    expect(useMediaViewerStore.getState().isLoading).toBe(false);
  });

  it("別スレッドの終了処理では表示中のビューアーを閉じない", () => {
    useMediaViewerStore
      .getState()
      .openMediaFromUrl("https://example.com/image.jpg", undefined, "thread-a");

    useMediaViewerStore.getState().closeViewer("thread-b");

    expect(useMediaViewerStore.getState().viewer).not.toBeNull();
    expect(useMediaViewerStore.getState().viewerScopeId).toBe("thread-a");
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

  it("ホイールの移動量を累積し、逆方向に同じ量だけ動かすと元の倍率へ戻る", () => {
    const store = useMediaViewerStore.getState();
    store.zoomByWheel(-40);
    store.zoomByWheel(-60);
    expect(useMediaViewerStore.getState().viewerScale).toBeCloseTo(Math.exp(0.18), 10);

    store.zoomByWheel(100);
    expect(useMediaViewerStore.getState().viewerScale).toBeCloseTo(1, 10);
  });

  it("細かなホイール入力を丸めず、無効な入力と縮小下限を扱う", () => {
    const store = useMediaViewerStore.getState();
    store.zoomByWheel(-1);
    expect(useMediaViewerStore.getState().viewerScale).toBeCloseTo(Math.exp(0.0018), 10);
    store.zoomByWheel(Number.NaN);
    store.zoomByWheel(Number.POSITIVE_INFINITY);
    store.zoomByWheel(0);
    expect(useMediaViewerStore.getState().viewerScale).toBeCloseTo(Math.exp(0.0018), 10);
    store.zoomByWheel(10000);
    expect(useMediaViewerStore.getState().viewerScale).toBe(0.25);
  });
});
