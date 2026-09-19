import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { dispatchMock, getStore2StringMock, setStore2StringMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  getStore2StringMock: vi.fn(() => null as string | null),
  setStore2StringMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("src/app", () => ({
  platform: {
    http: {
      setupWriteHeaders: vi.fn(),
    },
  },
}));

vi.mock("src/app/Store2Storage", () => ({
  getStore2String: getStore2StringMock,
  setStore2String: setStore2StringMock,
}));

vi.mock("src/core/URL", () => ({
  URL: class MockURL {},
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: vi.fn(() => ""),
      ready: vi.fn((callback: () => void) => callback()),
    },
    message: {
      on: vi.fn(),
      off: vi.fn(),
    },
  },
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({ dispatch: dispatchMock }),
}));

vi.mock("src/view/browser/utils/thread-write-sync", () => ({
  notifyThreadWriteCompleted: vi.fn(),
  notifyThreadWriteStarted: vi.fn(),
  resolveWriteSuccessDelayMs: vi.fn(() => 0),
}));

import { useWrite } from "src/view/browser/hooks/use-write";

const THREAD_URL = "https://example.com/test/read.cgi/software/1/";
const NEXT_THREAD_URL = "https://example.com/test/read.cgi/software/2/";

describe("useWrite", () => {
  beforeEach(() => {
    getStore2StringMock.mockReturnValue(null);
    setStore2StringMock.mockClear();
    dispatchMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("postMessage由来のエラー本文をstatusTextへ設定する", () => {
    const { result } = renderHook(() => useWrite(THREAD_URL));
    const errorMessage = "ERROR: 投稿内容を確認してください";

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "error", message: errorMessage },
        }),
      );
    });

    expect(result.current.status).toBe("error");
    expect(result.current.statusText).toBe(`書き込み失敗: ${errorMessage}`);
  });

  it("postMessageの空エラーには既定の本文を設定する", () => {
    const { result } = renderHook(() => useWrite(THREAD_URL));

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "error", message: "" },
        }),
      );
    });

    expect(result.current.status).toBe("error");
    expect(result.current.statusText).toBe("書き込みに失敗しました");
  });

  it("postMessageの長文エラーを省略せず保持する", () => {
    const { result } = renderHook(() => useWrite(THREAD_URL));
    const errorMessage = "長いエラー内容\n".repeat(200);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "error", message: errorMessage },
        }),
      );
    });

    expect(result.current.statusText).toBe(`書き込み失敗: ${errorMessage}`);
  });

  it("次スレへ移動したら旧スレの書き込み状態を引き継がない", () => {
    let threadUrl = THREAD_URL;
    const { result, rerender } = renderHook(() => useWrite(threadUrl));

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "error", message: "旧スレの投稿エラー" },
        }),
      );
    });
    expect(result.current.status).toBe("error");

    threadUrl = NEXT_THREAD_URL;
    rerender();

    expect(result.current.status).toBe("idle");
    expect(result.current.statusText).toBe("");
  });
});
