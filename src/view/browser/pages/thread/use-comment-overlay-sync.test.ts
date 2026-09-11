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
    start: vi.fn().mockResolvedValue(undefined),
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
        autoRefreshEnabled: false,
        expired: false,
        missingFromSubject: false,
      }),
    );

    expect(controller.syncThread).toHaveBeenCalledWith(THREAD_URL, [response(1)]);
  });

  it("非アクティブThreadPageからはsnapshotも停止要求も送らない", () => {
    const controller = createController("running", THREAD_URL);

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: false,
        autoRefreshEnabled: true,
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
        autoRefreshEnabled: true,
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
        autoRefreshEnabled: true,
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
        autoRefreshEnabled: true,
        expired: false,
        missingFromSubject: true,
      }),
    );

    expect(controller.stop).not.toHaveBeenCalled();
  });

  it("自動更新を有効にすると現在のsnapshotから実況を開始する", () => {
    const controller = createController("idle", null);
    const responses = [response(1)];

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses,
        isActive: true,
        autoRefreshEnabled: true,
        expired: false,
        missingFromSubject: false,
      }),
    );

    expect(controller.start).toHaveBeenCalledWith(THREAD_URL, responses);
  });

  it("自動更新中にresponsesが更新されても実況開始を多重実行しない", () => {
    const controller = createController("idle", null);
    const { rerender } = renderHook(
      ({ responses }) =>
        useCommentOverlaySync({
          controller,
          threadUrl: THREAD_URL,
          responses,
          isActive: true,
          autoRefreshEnabled: true,
          expired: false,
          missingFromSubject: false,
        }),
      { initialProps: { responses: [response(1)] } },
    );

    rerender({ responses: [response(1), response(2)] });
    rerender({ responses: [response(1), response(2), response(3)] });

    expect(controller.start).toHaveBeenCalledTimes(1);
  });

  it("フォーカス外から戻ったときだけ実況開始を要求する", () => {
    const controller = createController("idle", null);
    const { rerender } = renderHook(
      ({ isActive }) =>
        useCommentOverlaySync({
          controller,
          threadUrl: THREAD_URL,
          responses: [response(1)],
          isActive,
          autoRefreshEnabled: true,
          expired: false,
          missingFromSubject: false,
        }),
      { initialProps: { isActive: false } },
    );

    expect(controller.start).not.toHaveBeenCalled();

    rerender({ isActive: true });

    expect(controller.start).toHaveBeenCalledTimes(1);
  });

  it("自動更新を無効にすると対象スレッドの実況も停止する", () => {
    const controller = createController("running", THREAD_URL);

    renderHook(() =>
      useCommentOverlaySync({
        controller,
        threadUrl: THREAD_URL,
        responses: [response(1)],
        isActive: true,
        autoRefreshEnabled: false,
        expired: false,
        missingFromSubject: false,
      }),
    );

    expect(controller.stop).toHaveBeenCalledTimes(1);
  });
});
