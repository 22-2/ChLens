import type { Window as TauriWindow } from "@tauri-apps/api/window";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { cursorPositionMock, getCurrentWindowMock } = vi.hoisted(() => ({
  cursorPositionMock: vi.fn(),
  getCurrentWindowMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  cursorPosition: cursorPositionMock,
  getCurrentWindow: getCurrentWindowMock,
}));

vi.mock("src/app/platform/runtime", () => ({ isTauriRuntime: () => true }));

import { useOverlayPointerCapture } from "./use-overlay-pointer-capture";

describe("useOverlayPointerCapture", () => {
  const setIgnoreCursorEvents = vi.fn(async (_ignore: boolean) => {});
  const currentWindow = {
    isVisible: vi.fn(async () => true),
    innerPosition: vi.fn(async () => ({ x: 10, y: 20 })),
    scaleFactor: vi.fn(async () => 1),
    setIgnoreCursorEvents,
  };

  beforeEach(() => {
    cursorPositionMock.mockResolvedValue({ x: 15, y: 25 });
    getCurrentWindowMock.mockReturnValue(currentWindow as unknown as TauriWindow);
    setIgnoreCursorEvents.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("コメント上だけ透過を解除し、ポインターが外れたら再び透過する", async () => {
    const root = document.createElement("main");
    const comment = document.createElement("div");
    comment.className = "comment-overlay-stage__comment";
    comment.dataset.commentKey = "example-thread:1";
    root.append(comment);
    let hitTarget: Element | null = comment;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => hitTarget,
    });
    const rootRef = { current: root } as RefObject<HTMLElement | null>;
    const { result, unmount } = renderHook(() => useOverlayPointerCapture(rootRef));

    await waitFor(() => {
      expect(setIgnoreCursorEvents).toHaveBeenLastCalledWith(false);
      expect(result.current).toBe("example-thread:1");
    });
    expect(currentWindow.innerPosition).toHaveBeenCalled();

    hitTarget = null;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await waitFor(() => {
      expect(setIgnoreCursorEvents).toHaveBeenLastCalledWith(true);
      expect(result.current).toBeNull();
    });

    unmount();
  });
});
