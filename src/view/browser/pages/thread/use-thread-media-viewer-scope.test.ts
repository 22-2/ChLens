import { cleanup, renderHook } from "@testing-library/react";
import {
  getThreadMediaViewerScopeId,
  useMediaViewerStore,
} from "src/features/media/browser/use-media-viewer-store";
import { useThreadMediaViewerScope } from "src/view/browser/pages/thread/use-thread-media-viewer-scope";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";
const IMAGE_URL = "https://images.example.com/photo.png";
const SECOND_IMAGE_URL = "https://images.example.com/second.png";

describe("useThreadMediaViewerScope", () => {
  const originalOpenMediaFromUrl = useMediaViewerStore.getState().openMediaFromUrl;
  const openMediaFromUrl = vi.fn();

  beforeEach(() => {
    useMediaViewerStore.setState({ openMediaFromUrl });
  });

  afterEach(() => {
    cleanup();
    useMediaViewerStore.setState({ openMediaFromUrl: originalOpenMediaFromUrl });
    vi.clearAllMocks();
  });

  it("タブとスレッドから作る識別子を返す", () => {
    const { result } = renderHook(() => useThreadMediaViewerScope("tab-1", THREAD_URL));

    expect(result.current.mediaViewerScopeId).toBe(
      getThreadMediaViewerScopeId("tab-1", THREAD_URL),
    );
  });

  it("同じスレッドでもタブが違えば、別の識別子になる", () => {
    const first = renderHook(() => useThreadMediaViewerScope("tab-1", THREAD_URL));
    const second = renderHook(() => useThreadMediaViewerScope("tab-2", THREAD_URL));

    expect(first.result.current.mediaViewerScopeId).not.toBe(
      second.result.current.mediaViewerScopeId,
    );
  });

  it("画像を開くと、スレッドの識別子を付けてビューアーへ渡す", () => {
    const { result } = renderHook(() => useThreadMediaViewerScope("tab-1", THREAD_URL));

    result.current.openMediaFromUrl(IMAGE_URL);

    expect(openMediaFromUrl).toHaveBeenCalledWith(
      IMAGE_URL,
      undefined,
      getThreadMediaViewerScopeId("tab-1", THREAD_URL),
    );
  });

  it("本文の画像一覧を指定すると、その一覧も一緒に渡す", () => {
    const { result } = renderHook(() => useThreadMediaViewerScope("tab-1", THREAD_URL));

    result.current.openMediaFromUrl(IMAGE_URL, [IMAGE_URL, SECOND_IMAGE_URL]);

    expect(openMediaFromUrl).toHaveBeenCalledWith(
      IMAGE_URL,
      [IMAGE_URL, SECOND_IMAGE_URL],
      getThreadMediaViewerScopeId("tab-1", THREAD_URL),
    );
  });

  it("保存用の画像一覧を指定すると、保存用の一覧も4つ目の引数として渡す", () => {
    const { result } = renderHook(() => useThreadMediaViewerScope("tab-1", THREAD_URL));

    result.current.openMediaFromUrl(IMAGE_URL, [IMAGE_URL], [IMAGE_URL, SECOND_IMAGE_URL]);

    expect(openMediaFromUrl).toHaveBeenCalledWith(
      IMAGE_URL,
      [IMAGE_URL],
      getThreadMediaViewerScopeId("tab-1", THREAD_URL),
      [IMAGE_URL, SECOND_IMAGE_URL],
    );
  });
});
