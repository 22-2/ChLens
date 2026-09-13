import { cleanup, renderHook } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useCommentOverlaySync } from "./use-comment-overlay-sync";

const THREAD_URL = "https://example.test/test/read.cgi/live/1/";

function response(num: number): IRes {
  return {
    num,
    name: "名無し",
    mail: "",
    date: "2026/08/30(日) 12:00:00",
    message: `レス${num}`,
  };
}

describe("useCommentOverlaySync", () => {
  afterEach(() => {
    cleanup();
  });

  it("有効なThreadPageのsnapshotをcontrollerへ共有する", () => {
    const controller = { syncThread: vi.fn() };

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: true,
      }),
    );

    expect(controller.syncThread).toHaveBeenCalledWith(THREAD_URL, [response(1)]);
  });

  it("無効なThreadPageからはsnapshotを共有しない", () => {
    const controller = { syncThread: vi.fn() };

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: false,
      }),
    );

    expect(controller.syncThread).not.toHaveBeenCalled();
  });

  it("snapshot更新だけでは実況の開始や停止を要求しない", () => {
    const controller = { syncThread: vi.fn() };
    const { rerender } = renderHook(
      ({ responses }) =>
        useCommentOverlaySync({
          controller,
          threadUrl: THREAD_URL,
          responses,
          isActive: true,
        }),
      { initialProps: { responses: [response(1)] } },
    );

    rerender({ responses: [response(1), response(2)] });

    expect(controller.syncThread).toHaveBeenLastCalledWith(THREAD_URL, [response(1), response(2)]);
  });

  it("自分のレス番号を同じsnapshotと一緒にcontrollerへ共有する", () => {
    const controller = { syncThread: vi.fn() };
    const ownResponseNumbers = new Set([2]);

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1), response(2)],
        isActive: true,
        ownResponseNumbers,
      }),
    );

    expect(controller.syncThread).toHaveBeenCalledWith(THREAD_URL, [response(1), response(2)], {
      ownResponseNumbers,
    });
  });
});
