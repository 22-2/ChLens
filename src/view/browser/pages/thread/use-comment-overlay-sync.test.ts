import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { IRes } from "src/service-container/interfaces";
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

function createController(status: "idle" | "running" | "stopped", targetThreadUrl: string | null) {
  return {
    getSnapshot: vi.fn(() => ({
      state: {
        status,
        targetThreadUrl,
        cursor: null,
      },
      visible: true,
      error: null,
    })),
    stop: vi.fn().mockResolvedValue(undefined),
    syncThread: vi.fn(),
  };
}

describe("useCommentOverlaySync", () => {
  afterEach(() => {
    cleanup();
  });

  it("表示中ThreadPageのsnapshotをcontrollerへ共有する", () => {
    const controller = createController("idle", null);

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: true,
        expired: false,
        missingFromSubject: false,
      }),
    );

    expect(controller.syncThread).toHaveBeenCalledWith(THREAD_URL, [response(1)]);
  });

  it("非アクティブThreadPageからはsnapshotを共有しない", () => {
    const controller = createController("running", THREAD_URL);

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: false,
        expired: true,
        missingFromSubject: false,
      }),
    );

    expect(controller.syncThread).not.toHaveBeenCalled();
    expect(controller.stop).not.toHaveBeenCalled();
  });

  it("対象スレッドのdat落ちを検知したら実況を停止する", () => {
    const controller = createController("running", THREAD_URL);

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: true,
        expired: true,
        missingFromSubject: false,
      }),
    );

    expect(controller.stop).toHaveBeenCalledTimes(1);
  });

  it("一時的な取得エラーに相当する終了フラグなしでは実況を停止しない", () => {
    const controller = createController("running", THREAD_URL);

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: true,
        expired: false,
        missingFromSubject: false,
      }),
    );

    expect(controller.stop).not.toHaveBeenCalled();
  });

  it("別スレッドの終了通知では実況対象を停止しない", () => {
    const controller = createController("running", "https://example.test/other/2/");

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: true,
        expired: false,
        missingFromSubject: true,
      }),
    );

    expect(controller.stop).not.toHaveBeenCalled();
  });
});
