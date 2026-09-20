import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  dispatchMock,
  fetchMock,
  fetchTauriWriteMock,
  getStore2StringMock,
  setStore2StringMock,
  setupWriteHeadersMock,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  fetchMock: vi.fn(),
  fetchTauriWriteMock: vi.fn(),
  getStore2StringMock: vi.fn(() => null as string | null),
  setStore2StringMock: vi.fn(() => Promise.resolve()),
  setupWriteHeadersMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("src/app", () => ({
  platform: {
    http: {
      fetch: fetchMock,
      setupWriteHeaders: setupWriteHeadersMock,
    },
  },
}));

vi.mock("src/app/platform/runtime", () => ({
  isTauriRuntime: () => true,
}));

vi.mock("src/app/platform/tauri/WriteTransport", () => ({
  fetchTauriWrite: fetchTauriWriteMock,
}));

vi.mock("src/app/Store2Storage", () => ({
  getStore2String: getStore2StringMock,
  setStore2String: setStore2StringMock,
}));

vi.mock("src/core/URL", () => ({
  URL: class MockURL {
    protocol = "https:";
    hostname = "example.com";
    pathname = "/test/read.cgi/software/1/";

    constructor(_url: string) {}

    guessType() {
      return { bbsType: "2ch" };
    }

    getTsld() {
      return "example.com";
    }

    toBoard() {
      return { href: "https://example.com/software/" };
    }
  },
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

import { parseTauriWriteResult, useWrite } from "src/view/browser/hooks/use-write";
import { collectWriteConfirmationFields } from "src/view/browser/utils/write-confirmation";

const THREAD_URL = "https://example.com/test/read.cgi/software/1/";
const NEXT_THREAD_URL = "https://example.com/test/read.cgi/software/2/";

describe("useWrite", () => {
  beforeEach(() => {
    getStore2StringMock.mockReturnValue(null);
    setStore2StringMock.mockClear();
    dispatchMock.mockClear();
    fetchMock.mockReset();
    fetchTauriWriteMock.mockReset();
    setupWriteHeadersMock.mockClear();
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

  it("同じスレッドの外部下書き追加を入力欄へ反映する", () => {
    let draft = "既存の本文";
    const { result, rerender } = renderHook(() => useWrite(THREAD_URL, { draft }));

    expect(result.current.message).toBe("既存の本文");

    draft = "既存の本文\n引用レス";
    act(() => rerender());

    expect(result.current.message).toBe("既存の本文\n引用レス");
  });

  it("Tauri版は確認HTMLを表示し、同じセッションで確認フォームを再送信する", async () => {
    const action = "https://example.com/test/bbs.cgi";
    fetchTauriWriteMock
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        url: action,
        body: `<html><head><title>書き込み確認</title></head><body><form method="post" action="${action}"><input type="hidden" name="token" value="確認値"><button type="submit" name="submit" value="承諾して書き込む">承諾して書き込む</button></form></body></html>`,
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        url: action,
        body: '<html><head><title>書きこみました</title><meta http-equiv="refresh" content="0"></head></html>',
      });

    const { result } = renderHook(() => useWrite(THREAD_URL));
    act(() => result.current.setMessage("本文"));
    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.status).toBe("confirm");
    expect(result.current.confirmationPage?.forms).toEqual([{ id: "form-0", action }]);

    const document = new DOMParser().parseFromString(
      result.current.confirmationPage?.html ?? "",
      "text/html",
    );
    const form = document.forms[0];
    const button = form.querySelector("button");
    if (!form || !button) throw new Error("確認フォームを取得できませんでした");

    await act(async () => {
      await result.current.submitConfirmation({
        formId: "form-0",
        fields: collectWriteConfirmationFields(form, button),
      });
    });

    expect(result.current.status).toBe("success");
    expect(fetchTauriWriteMock).toHaveBeenCalledTimes(2);
    expect(fetchTauriWriteMock.mock.calls[0]?.[0]).toMatchObject({
      action,
      bootstrapUrl: THREAD_URL,
    });
    expect(fetchTauriWriteMock.mock.calls[1]?.[0]).toMatchObject({
      action,
      referer: action,
    });
  });

  it("Tauri確認レスポンスには実行不能な安全表示用HTMLを保持する", () => {
    const result = parseTauriWriteResult(
      {
        status: 200,
        headers: {},
        url: THREAD_URL.replace("read.cgi/software/1/", "bbs.cgi"),
        body: '<html><head><title>書き込み確認</title><script>alert(1)</script></head><body><form method="post" action="https://example.com/test/bbs.cgi"><button>確認</button></form></body></html>',
      },
      "https://example.com/test/bbs.cgi",
      "https://example.com/test/bbs.cgi",
      "Shift_JIS",
    );

    expect(result?.type).toBe("confirm");
    expect(result?.type === "confirm" ? result.page?.html : "").not.toContain("<script");
  });

  it("eddibbの未認証レスポンスを認証コード案内として判定する", () => {
    const result = parseTauriWriteResult(
      {
        status: 200,
        headers: { "content-type": "text/html; charset=x-sjis" },
        url: "https://example.com/test/bbs.cgi",
        body: '<html><head><meta name="error_code" content="E-Unauthenticated"><title>ＥＲＲＯＲ</title></head><body>認証コード\'332376\'を用いてください https://example.com/auth-code</body></html>',
      },
      "https://example.com/test/bbs.cgi",
      "https://example.com/test/bbs.cgi",
      "Shift_JIS",
    );

    expect(result).toEqual({
      type: "auth-code",
      code: "332376",
      url: "https://example.com/auth-code",
    });
  });
});
