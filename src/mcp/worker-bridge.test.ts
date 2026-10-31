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

function sendWorkerState(): void {
  for (const listener of browserMock.messageListeners) {
    listener({ type: "mcp-state", activeThreadUrl: THREAD_URL, format2chnet: null });
  }
}

describe("MCP中継の再接続の上限", () => {
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    bridge = await import("./worker-bridge");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("接続が3回続けて失敗すると、自動の再試行を止める", async () => {
    bridge.startMcpWorker();

    await vi.advanceTimersByTimeAsync(0);
    expect(registerCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(registerCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(registerCalls()).toBe(3);

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(registerCalls()).toBe(3);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("3回続いた"));
  });

  it("止めたあとは、アラームで起きても接続も取得も試みない", async () => {
    bridge.startMcpWorker();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(registerCalls()).toBe(3);

    fireAlarm();
    await vi.advanceTimersByTimeAsync(0);

    expect(registerCalls()).toBe(3);
    expect(pollCalls()).toBe(0);
  });

  it("利用者がスレッドを開くと、止めていた再試行を再開し、再び3回で止まる", async () => {
    bridge.startMcpWorker();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(registerCalls()).toBe(3);

    sendWorkerState();
    await vi.advanceTimersByTimeAsync(0);
    expect(registerCalls()).toBe(4);

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(registerCalls()).toBe(6);
  });

  it("拡張機能の起動時は、止めていた再試行を最初からやり直す", async () => {
    bridge.startMcpWorker();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(registerCalls()).toBe(3);

    for (const listener of browserMock.startupListeners) listener();
    await vi.advanceTimersByTimeAsync(0);

    expect(registerCalls()).toBe(4);
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

    // 接続後に切れ、中継がまた落ちたら、失敗の数は0からなので、さらに3回は試みる。
    relay.online = false;
    FakeWebSocket.instances[0]!.drop();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
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
