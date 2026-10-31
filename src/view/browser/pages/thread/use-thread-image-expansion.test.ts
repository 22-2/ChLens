import { act, cleanup, renderHook } from "@testing-library/react";
import { useThreadImageExpansion } from "src/view/browser/pages/thread/use-thread-image-expansion";
import { afterEach, describe, expect, it } from "vite-plus/test";

const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";
const OTHER_THREAD_URL = "https://example.com/test/read.cgi/board/1000000002/";
const IMAGE_A = "https://images.example.com/a.png";
const IMAGE_B = "https://images.example.com/b.png";

describe("useThreadImageExpansion", () => {
  afterEach(() => {
    cleanup();
  });

  it("初期状態では展開中の画像がない", () => {
    const { result } = renderHook(() => useThreadImageExpansion(THREAD_URL));

    expect(result.current.expandedImages?.size).toBe(0);
  });

  it("画像を開くと同じレスの展開状態になり、もう一度開くと閉じる", () => {
    const { result } = renderHook(() => useThreadImageExpansion(THREAD_URL));

    act(() => result.current.toggleImage(3, IMAGE_A));
    expect(result.current.expandedImages?.get(3)).toEqual(new Set([IMAGE_A]));

    act(() => result.current.toggleImage(3, IMAGE_A));
    expect(result.current.expandedImages?.has(3)).toBe(false);
  });

  it("同じレスの複数の画像は別々に展開でき、片方を閉じても他方は残る", () => {
    const { result } = renderHook(() => useThreadImageExpansion(THREAD_URL));

    act(() => result.current.toggleImage(3, IMAGE_A));
    act(() => result.current.toggleImage(3, IMAGE_B));
    act(() => result.current.toggleImage(3, IMAGE_A));

    expect(result.current.expandedImages?.get(3)).toEqual(new Set([IMAGE_B]));
  });

  it("レスの画像をすべて閉じると、そのレス番号は展開状態から消える", () => {
    const { result } = renderHook(() => useThreadImageExpansion(THREAD_URL));

    act(() => result.current.toggleImage(3, IMAGE_A));
    act(() => result.current.toggleImage(4, IMAGE_B));
    act(() => result.current.toggleImage(3, IMAGE_A));

    expect(result.current.expandedImages?.has(3)).toBe(false);
    expect(result.current.expandedImages?.get(4)).toEqual(new Set([IMAGE_B]));
  });

  it("スレッドが変わると前のスレッドの展開状態を返さず、新しいスレッドへ引き継がない", () => {
    const { result, rerender } = renderHook(({ threadUrl }) => useThreadImageExpansion(threadUrl), {
      initialProps: { threadUrl: THREAD_URL },
    });
    act(() => result.current.toggleImage(3, IMAGE_A));

    rerender({ threadUrl: OTHER_THREAD_URL });
    expect(result.current.expandedImages).toBeNull();

    act(() => result.current.toggleImage(3, IMAGE_B));
    expect(result.current.expandedImages?.get(3)).toEqual(new Set([IMAGE_B]));
  });

  it("画像の幅をレスと画像ごとに保持し、別の画像の幅で上書きしない", () => {
    const { result } = renderHook(() => useThreadImageExpansion(THREAD_URL));

    act(() => result.current.resizeImage(3, IMAGE_A, 320));
    act(() => result.current.resizeImage(3, IMAGE_B, 240));

    expect(result.current.imageWidths.threadUrl).toBe(THREAD_URL);
    expect(result.current.imageWidths.responses.get(3)?.get(IMAGE_A)).toBe(320);
    expect(result.current.imageWidths.responses.get(3)?.get(IMAGE_B)).toBe(240);
  });

  it("別のスレッドの画像幅は引き継がず、新しいスレッドの幅だけを保持する", () => {
    const { result, rerender } = renderHook(({ threadUrl }) => useThreadImageExpansion(threadUrl), {
      initialProps: { threadUrl: THREAD_URL },
    });
    act(() => result.current.resizeImage(3, IMAGE_A, 320));

    rerender({ threadUrl: OTHER_THREAD_URL });
    act(() => result.current.resizeImage(5, IMAGE_B, 200));

    expect(result.current.imageWidths.threadUrl).toBe(OTHER_THREAD_URL);
    expect(result.current.imageWidths.responses.get(3)).toBeUndefined();
    expect(result.current.imageWidths.responses.get(5)?.get(IMAGE_B)).toBe(200);
  });
});
