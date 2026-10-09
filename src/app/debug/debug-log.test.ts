import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { collectDebugState, registerDebugStateProvider } from "./debug-api";
import {
  installConsoleCapture,
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
