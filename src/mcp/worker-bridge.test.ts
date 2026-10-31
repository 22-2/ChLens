// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { MCP_BRIDGE_ALARM_NAME } from "./protocol";

// 拡張機能のAPI・中継サーバー・WebSocketをメモリ上に再現する。
// 中継が落ちている間は、通信が失敗する（fetch が例外になる）。
const browserMock = vi.hoisted(() => {
  const alarmListeners: ((alarm: { name: string }) => void)[] = [];
  const messageListeners: ((message: unknown) => void)[] = [];
  const startupListeners: (() => void)[] = [];
  const api = {
    alarms: {
      get: vi.fn(async () => undefined),
      create: vi.fn(async () => undefined),
      onAlarm: {
        addListener: (listener: (alarm: { name: string }) => void) => {
          alarmListeners.push(listener);
        },
      },
    },
    runtime: {
      onStartup: {
        addListener: (listener: () => void) => {
          startupListeners.push(listener);
        },
      },
      onInstalled: { addListener: vi.fn() },
      onMessage: {
        addListener: (listener: (message: unknown) => void) => {
          messageListeners.push(listener);
        },
      },
    },
  };
  return { api, alarmListeners, messageListeners, startupListeners };
});

vi.mock("webextension-polyfill", () => ({ default: browserMock.api }));

vi.mock("./worker-runtime", () => ({
  executeWorkerRequest: vi.fn(),
  persistWorkerState: vi.fn(async () => undefined),
}));

const REGISTER_PATH = "/v1/register";
const POLL_PATH = "/v1/poll";
const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";
/** Chrome のアラームの最短の周期（30秒）。テストでは、この周期で起床させる。 */
const ALARM_PERIOD_MS = 30_000;

const relay = { online: false };

const fetchMock = vi.fn(async (url: string) => {
  if (!relay.online) throw new TypeError("fetch failed");
  const body = url.endsWith(REGISTER_PATH) ? { clientId: "client-1" } : { request: null };
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
});

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(): void {}

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** 中継との接続が確立したことを再現する。 */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** つながった後に切れたことを再現する。 */
  drop(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

type Bridge = typeof import("./worker-bridge");

function registerCalls(): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(REGISTER_PATH)).length;
}

function pollCalls(): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(POLL_PATH)).length;
}

function fireAlarm(): void {
  for (const listener of browserMock.alarmListeners) {
    listener({ name: MCP_BRIDGE_ALARM_NAME });
  }
}

/** アラームの起床を、指定した回数だけ進める。 */
async function passAlarmTicks(count: number): Promise<void> {
  for (let tick = 0; tick < count; tick += 1) {
    await vi.advanceTimersByTimeAsync(ALARM_PERIOD_MS);
    fireAlarm();
    await vi.advanceTimersByTimeAsync(0);
  }
}

function sendWorkerState(): void {
  for (const listener of browserMock.messageListeners) {
    listener({ type: "mcp-state", activeThreadUrl: THREAD_URL, format2chnet: null });
  }
}

describe("MCP中継への接続", () => {
  let bridge: Bridge;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    relay.online = false;
    fetchMock.mockClear();
    FakeWebSocket.instances = [];
    browserMock.alarmListeners.length = 0;
    browserMock.messageListeners.length = 0;
    browserMock.startupListeners.length = 0;
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    bridge = await import("./worker-bridge");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("接続が3回続けて失敗しても、エラーとしては記録せず、1分ごとの確認に切り替える", async () => {
    bridge.startMcpWorker();

    await vi.advanceTimersByTimeAsync(6_000);

    expect(registerCalls()).toBe(3);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("1分ごと"));
  });

  it("1分経つまでは、アラームで起きても接続も取得も試みない", async () => {
    bridge.startMcpWorker();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(registerCalls()).toBe(3);

    await passAlarmTicks(1);
    expect(registerCalls()).toBe(3);
    expect(pollCalls()).toBe(0);

    await passAlarmTicks(1);
    expect(registerCalls()).toBe(4);
  });

  it("中継が見つからない間は、1分ごとに確認を続け、エラーは記録しない", async () => {
    bridge.startMcpWorker();
    await vi.advanceTimersByTimeAsync(6_000);

    // 6秒の時点から20回（10分）のアラーム起床で、1分ごとに確認する。
    await passAlarmTicks(20);

    expect(registerCalls()).toBe(13);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("利用者がスレッドを開くと、1分を待たずにすぐ確認する", async () => {
    bridge.startMcpWorker();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(registerCalls()).toBe(3);

    sendWorkerState();
    await vi.advanceTimersByTimeAsync(0);

    expect(registerCalls()).toBe(4);
  });

  it("拡張機能の起動時は、待機中でも最初からやり直す", async () => {
    bridge.startMcpWorker();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(registerCalls()).toBe(3);

    for (const listener of browserMock.startupListeners) listener();
    await vi.advanceTimersByTimeAsync(0);

    expect(registerCalls()).toBe(4);
  });

  it("中継が見つかると次の確認で接続し、接続したことを一度だけ知らせる", async () => {
    bridge.startMcpWorker();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(console.info).toHaveBeenCalledTimes(1);

    // 中継を起動した後、次の確認（1分後）で接続が確立する。
    relay.online = true;
    await passAlarmTicks(2);

    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0]!.open();
    expect(console.info).toHaveBeenCalledTimes(2);
    expect(console.info).toHaveBeenLastCalledWith(expect.stringContaining("接続しました"));
    expect(console.error).not.toHaveBeenCalled();
  });

  it("接続できたあとは、失敗の数を数え直す", async () => {
    bridge.startMcpWorker();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(registerCalls()).toBe(2);

    // 三回目の試みで中継に届き、接続が確立する。
    relay.online = true;
    await vi.advanceTimersByTimeAsync(4_000);
    expect(registerCalls()).toBe(3);
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0]!.open();

    // 接続後に切れ、中継がまた落ちたら、失敗の数は0からなので、数秒おきに3回は試みてから待機する。
    relay.online = false;
    FakeWebSocket.instances[0]!.drop();
    await vi.advanceTimersByTimeAsync(14_000);
    expect(registerCalls()).toBe(6);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(registerCalls()).toBe(6);
  });

  it("一度つながった後の切断は、失敗として数えず、再接続を続ける", async () => {
    relay.online = true;
    bridge.startMcpWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(1);

    for (let cycle = 1; cycle <= 4; cycle += 1) {
      FakeWebSocket.instances.at(-1)!.open();
      FakeWebSocket.instances.at(-1)!.drop();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(FakeWebSocket.instances).toHaveLength(cycle + 1);
    }
  });
});
