import browser from "webextension-polyfill";

import {
  type BridgeRequest,
  MCP_BRIDGE_ALARM_NAME,
  MCP_BRIDGE_BASE_URL,
  MCP_BRIDGE_WS_URL,
} from "./protocol";
import { executeWorkerRequest, persistWorkerState } from "./worker-runtime";

const HTTP_TIMEOUT_MS = 25_000;
const HTTP_RETRY_ALARM_MINUTES = 1;
const INITIAL_RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const KEEPALIVE_INTERVAL_MS = 20_000;
const WS_CONNECT_TIMEOUT_MS = 10_000;
const CONNECTION_LOG_INTERVAL_MS = 30_000;

interface RegisterResponse {
  clientId: string;
}

interface PollResponse {
  request: BridgeRequest | null;
}

interface WorkerStateMessage {
  type: "mcp-state";
  activeThreadUrl?: string | null;
  format2chnet?: string | null;
}

let started = false;
let currentClientId: string | null = null;
let webSocket: WebSocket | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
let httpPollInFlight = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let connectInFlight: Promise<void> | null = null;
let lastConnectionErrorAt = 0;
let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;

function logConnectionError(message: string, error: unknown): void {
  const now = Date.now();
  // 変更理由: MCPサーバー未起動時はアラームと再接続が継続するため、毎回の接続失敗を
  // errorログへ出すと通常利用のログを埋めてしまう。詳細は保持しつつ30秒に一度へ制限する。
  if (now - lastConnectionErrorAt < CONNECTION_LOG_INTERVAL_MS) return;
  lastConnectionErrorAt = now;
  console.error(`[ChLens MCP] ${message}:`, error);
}

function isWorkerStateMessage(value: unknown): value is WorkerStateMessage {
  if (typeof value !== "object" || value === null) return false;
  return (value as { type?: unknown }).type === "mcp-state";
}

function clearKeepalive(): void {
  if (keepaliveTimer !== undefined) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = undefined;
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer !== undefined) return;
  const delay = reconnectDelayMs;
  reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, reconnectDelayMs * 2);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void connectWebSocket();
  }, delay);
}

function resetReconnectDelay(): void {
  reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(`${MCP_BRIDGE_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`中継HTTPエラー (${response.status})`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function registerClient(): Promise<string> {
  const result = await postJson<RegisterResponse>("/v1/register", {});
  if (!result.clientId) throw new Error("MCP中継のクライアントIDがありません");
  currentClientId = result.clientId;
  return result.clientId;
}

async function handleSocketMessage(raw: unknown): Promise<void> {
  if (typeof raw !== "string") return;
  let request: BridgeRequest | { type?: string };
  try {
    request = JSON.parse(raw) as BridgeRequest | { type?: string };
  } catch (error: unknown) {
    console.error("[ChLens MCP] WebSocket要求のJSON解析に失敗しました:", error);
    return;
  }
  if ("type" in request && request.type === "keepalive") return;
  if (
    !("requestId" in request) ||
    (request.operation !== "read-thread" && request.operation !== "search-logs")
  ) {
    console.error("[ChLens MCP] WebSocket要求の形式が不正です:", request);
    return;
  }

  const result = await executeWorkerRequest(request);
  if (webSocket?.readyState === WebSocket.OPEN) {
    try {
      webSocket.send(JSON.stringify(result));
    } catch (error: unknown) {
      console.error("[ChLens MCP] WebSocket応答の送信に失敗しました:", error);
      webSocket.close();
    }
  }
}

function startKeepalive(socket: WebSocket): void {
  clearKeepalive();
  keepaliveTimer = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      clearKeepalive();
      return;
    }
    // 変更理由: Chrome 116以降もサービスワーカーはメッセージ交換がないと停止するため、
    // 20秒間隔の小さなフレームでWebSocket接続と処理待ちを維持する。
    try {
      socket.send(JSON.stringify({ type: "keepalive" }));
    } catch (error: unknown) {
      console.error("[ChLens MCP] WebSocketキープアライブの送信に失敗しました:", error);
      socket.close();
    }
  }, KEEPALIVE_INTERVAL_MS);
}

async function connectWebSocket(): Promise<void> {
  if (connectInFlight) return connectInFlight;
  const connection = connectWebSocketOnce();
  connectInFlight = connection;
  try {
    await connection;
  } finally {
    connectInFlight = null;
  }
}

async function connectWebSocketOnce(): Promise<void> {
  if (typeof WebSocket === "undefined") return;
  if (
    webSocket &&
    (webSocket.readyState === WebSocket.OPEN || webSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  let clientId: string;
  try {
    clientId = await registerClient();
  } catch (error: unknown) {
    logConnectionError("MCP中継のクライアント登録に失敗しました", error);
    scheduleReconnect();
    return;
  }

  await new Promise<void>((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${MCP_BRIDGE_WS_URL}?clientId=${encodeURIComponent(clientId)}`);
    } catch (error: unknown) {
      logConnectionError("WebSocket接続の開始に失敗しました", error);
      scheduleReconnect();
      resolve();
      return;
    }
    webSocket = socket;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      resolve();
    };
    timeout = setTimeout(() => {
      if (settled) return;
      // 変更理由: 接続先が停止しているとWebSocketのCONNECTINGが長時間残り、
      // アラームによるHTTPフォールバックまで塞いでしまうため、一定時間で解放する。
      socket.close();
      scheduleReconnect();
      settle();
    }, WS_CONNECT_TIMEOUT_MS);
    socket.onopen = () => {
      resetReconnectDelay();
      startKeepalive(socket);
      settle();
    };
    socket.onmessage = (event) => {
      void handleSocketMessage(event.data);
    };
    socket.onerror = () => {
      // エラー本体はoncloseでまとめて扱い、同じ切断を二重記録しない。
    };
    socket.onclose = () => {
      if (webSocket === socket) webSocket = null;
      clearKeepalive();
      scheduleReconnect();
      settle();
    };
  });
}

async function pollHttpOnce(): Promise<void> {
  if (httpPollInFlight || webSocket) return;
  httpPollInFlight = true;
  try {
    const clientId = currentClientId ?? (await registerClient());
    const result = await postJson<PollResponse>("/v1/poll", { clientId });
    if (!result.request) return;
    const response = await executeWorkerRequest(result.request);
    await postJson("/v1/respond", {
      clientId,
      requestId: result.request.requestId,
      response,
    });
  } catch (error: unknown) {
    logConnectionError("MCP中継へのHTTP接続に失敗しました", error);
    // アラームで再試行する。サーバー未起動時も処理を止めず、次の起床で復旧を試みる。
  } finally {
    httpPollInFlight = false;
  }
}

async function ensureAlarm(): Promise<void> {
  if (!browser.alarms) return;
  const alarm = await browser.alarms.get(MCP_BRIDGE_ALARM_NAME);
  if (!alarm) {
    // Chrome 103までの互換性を保つため、アラームは1分間隔にする。
    await browser.alarms.create(MCP_BRIDGE_ALARM_NAME, {
      periodInMinutes: HTTP_RETRY_ALARM_MINUTES,
    });
  }
}

async function onAlarm(alarm: browser.Alarms.Alarm): Promise<void> {
  if (alarm.name !== MCP_BRIDGE_ALARM_NAME) return;
  await connectWebSocket();
  await pollHttpOnce();
}

export function startMcpWorker(): void {
  if (started || !browser.alarms) return;
  started = true;
  browser.alarms.onAlarm.addListener((alarm) => {
    void onAlarm(alarm).catch((error: unknown) => {
      logConnectionError("MCP中継アラームの処理に失敗しました", error);
    });
  });
  browser.runtime.onStartup.addListener(() => {
    void ensureAlarm();
    void connectWebSocket();
  });
  browser.runtime.onInstalled.addListener(() => {
    void ensureAlarm();
    void connectWebSocket();
  });
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isWorkerStateMessage(message)) return;
    void persistWorkerState(message.activeThreadUrl ?? null, message.format2chnet ?? null).catch(
      (error: unknown) => {
        console.error("[ChLens MCP] 現在スレッド情報の保存に失敗しました:", error);
      },
    );
  });
  void ensureAlarm().catch((error: unknown) => {
    console.error("[ChLens MCP] MCP用アラームの登録に失敗しました:", error);
  });
  void connectWebSocket();
}
