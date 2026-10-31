import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { collectDebugState, registerDebugStateProvider } from "./debug-api";
import {
  installConsoleCapture,
  installRuntimeErrorCapture,
  queryDebugLogs,
  recordDebugEvent,
  resetDebugLogForTest,
  toSerializable,
} from "./debug-log";

afterEach(() => {
  resetDebugLogForTest();
});

describe("デバッグログ", () => {
  it("循環参照とErrorを含む値もJSON化できる形へ変換する", () => {
    const value: Record<string, unknown> = { name: "a" };
    value.self = value;
    value.error = new Error("失敗");

    const result = toSerializable(value) as Record<string, unknown>;

    expect(result.self).toBe("[Circular]");
    expect(result.error).toMatchObject({ name: "Error", message: "失敗" });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("Cookieやトークンのキーは値を伏せる", () => {
    expect(
      toSerializable({ cookie: "a=b", accessToken: "xyz", sid: "s", inside: "見える" }),
    ).toEqual({
      cookie: "[redacted]",
      accessToken: "[redacted]",
      sid: "[redacted]",
      inside: "見える",
    });
  });

  it("出来事を呼び出し元のスタックつきで記録し、分類で絞り込める", () => {
    recordDebugEvent("auto-refresh", "停止", { tabId: "t1" });
    recordDebugEvent("other", "別件");

    const logs = queryDebugLogs({ category: "auto-refresh" });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ level: "event", message: "停止", data: { tabId: "t1" } });
    expect(logs[0].stack).toBeTypeOf("string");
  });

  it("console出力を元の出力先へ流しつつ記録する", () => {
    const original = vi.fn();
    const fakeConsole = {
      error: original,
      warn: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
    } as unknown as Console;

    installConsoleCapture(fakeConsole);
    fakeConsole.error("[ChLens] 失敗しました:", new Error("原因"));

    expect(original).toHaveBeenCalledTimes(1);
    expect(queryDebugLogs({ level: "error" })[0]).toMatchObject({
      category: "console",
      message: "[ChLens] 失敗しました: Error: 原因",
    });
  });
});

describe("デバッグ状態", () => {
  it("提供元の一つが失敗しても他の状態を返す", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const unregisterOk = registerDebugStateProvider("ok", () => ({ value: 1 }));
    const unregisterNg = registerDebugStateProvider("ng", () => {
      throw new Error("取得失敗");
    });

    const state = collectDebugState();

    expect(state.ok).toEqual({ value: 1 });
    expect(state.ng).toMatchObject({ error: { message: "取得失敗" } });
    unregisterOk();
    unregisterNg();
    errorSpy.mockRestore();
    expect(collectDebugState()).toEqual({});
  });
});

describe("未捕捉の例外の記録", () => {
  // installRuntimeErrorCapture は一度だけ登録するため、このブロックのテストは同じ window を使う。
  // 操作の記録は要素のイベントを捕捉段階で受けるので、要素を含む実際の window で検証する。
  const NOTICE = "ResizeObserver loop completed with undelivered notifications.";
  beforeAll(() => {
    installRuntimeErrorCapture(window);
  });

  it("未捕捉の例外と未処理のPromise拒否を runtime として記録する", () => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        error: new Error("描画に失敗"),
        filename: "browser.js",
        lineno: 12,
      }),
    );
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "拒否理由" }));

    const errors = queryDebugLogs({ level: "error", category: "runtime" });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ message: "未捕捉の例外 (browser.js:12): 描画に失敗" });
    expect(errors[0].stack).toContain("描画に失敗");
    expect(errors[1]).toMatchObject({ message: "未処理のPromise拒否: 拒否理由" });
  });

  it("ResizeObserverの通知は例外ではなく警告として記録し、文言は元のまま残す", () => {
    window.dispatchEvent(new ErrorEvent("error", { message: NOTICE }));

    expect(queryDebugLogs({ level: "error", category: "runtime" })).toHaveLength(0);
    expect(queryDebugLogs({ level: "warn", category: "runtime" })).toEqual([
      expect.objectContaining({ message: NOTICE }),
    ]);
  });

  it("ResizeObserverの警告には、直前の操作・スクロール・出来事を添える", () => {
    const button = document.createElement("button");
    button.setAttribute("aria-label", "更新");
    document.body.append(button);
    recordDebugEvent("auto-refresh", "自動更新状態が変わりました", undefined, { withStack: false });

    button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new ErrorEvent("error", { message: NOTICE }));
    button.remove();

    const [warning] = queryDebugLogs({ level: "warn", category: "runtime" });
    expect(warning.data).toMatchObject({
      lastInput: { target: "更新", agoMs: expect.any(Number) },
      lastScrollAgoMs: expect.any(Number),
      lastEvent: { category: "auto-refresh", message: "自動更新状態が変わりました" },
    });
  });

  it("キーの入力は文字そのものを残さず、Enterなどのキー名だけを残す", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    window.dispatchEvent(new ErrorEvent("error", { message: NOTICE }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    window.dispatchEvent(new ErrorEvent("error", { message: NOTICE }));

    const [first, second] = queryDebugLogs({ level: "warn", category: "runtime" });
    expect(first.data).toMatchObject({ lastInput: { target: "文字入力" } });
    expect(second.data).toMatchObject({ lastInput: { target: "Enter" } });
    expect(JSON.stringify(first.data)).not.toContain('"a"');
  });
});
