import browser from "webextension-polyfill";

import {
  BRIDGE_OPERATIONS,
  type BridgeRequest,
  MCP_BRIDGE_ALARM_NAME,
  MCP_BRIDGE_BASE_URL,
  MCP_BRIDGE_WS_URL,
} from "./protocol";
import { executeWorkerRequest, persistWorkerState } from "./worker-runtime";

const HTTP_TIMEOUT_MS = 25_000;
// 変更理由: MCPサーバーはチャットの利用に合わせて起動・終了するため、起動後に素早く
// 再接続できるよう、アラーム周期と再接続の上限を短くする（Chrome 120以降は30秒、
// それ以前は1分に丸められる）。
const HTTP_RETRY_ALARM_MINUTES = 0.5;
const INITIAL_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 15_000;
// 変更理由: MCPサーバーが起動していないのは想定どおりの状態なので、エラーとしては出さない。
// 起動直後は数回だけ素早く繋ぎ、見つからない間は一分ごとに静かに確認する。
const QUICK_CONNECTION_ATTEMPTS = 3;
const WAITING_RECONNECT_INTERVAL_MS = 60_000;
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
let consecutiveConnectionFailures = 0;
// 中継が見つからない間は、この時刻より前には接続も取得も試みない。
let nextAttemptAt = 0;
let waitingForServer = false;

function logConnectionError(message: string, error: unknown): void {
  const now = Date.now();
  // 変更理由: 想定外の失敗を記録する。詳細は保持しつつ30秒に一度へ制限する。
  if (now - lastConnectionErrorAt < CONNECTION_LOG_INTERVAL_MS) return;
  lastConnectionErrorAt = now;
  console.error(`[ChLens MCP] ${message}:`, error);
}

/** MCPサーバーが起動していない間の失敗は想定どおりなので、エラーではなく詳細ログとして残す。 */
function logConnectionAttemptFailure(message: string, error: unknown): void {
  console.debug(`[ChLens MCP] ${message}:`, error);
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

/**
 * 接続の試みが失敗したことを数える。
 * 最初の数回は数秒おきに試し、見つからなければ一分ごとの確認に切り替える。
 */
function recordConnectionFailure(): void {
  consecutiveConnectionFailures += 1;
  if (consecutiveConnectionFailures < QUICK_CONNECTION_ATTEMPTS) {
    scheduleReconnect();
    return;
  }
  // 数秒おきのタイマーは、休止したサービスワーカーでは止まる。一分ごとの確認は、
  // 起床の合図になるアラームに任せる。
  nextAttemptAt = Date.now() + WAITING_RECONNECT_INTERVAL_MS;
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (!waitingForServer) {
    waitingForServer = true;
    console.info(
      "[ChLens MCP] MCPサーバーが見つからないため、1分ごとに接続を確認します。MCPを使うスレッドを開くと、すぐに確認します。",
    );
  }
}

/** 接続できたら、失敗の数と再接続の間隔を初めからにする。 */
function resetConnectionFailures(): void {
  consecutiveConnectionFailures = 0;
  nextAttemptAt = 0;
  resetReconnectDelay();
}

/** 失敗の数を初めからにして、すぐに接続を試みる。拡張機能の起動・インストール時に使う。 */
function resumeConnection(): void {
  resetConnectionFailures();
  void connectWebSocket();
}

/** 見つからない間に利用者の操作（MCPを使うスレッドを開くなど）があったら、待たずに確認する。 */
function resumeConnectionIfWaiting(): void {
  if (!waitingForServer) return;
  resumeConnection();
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
  if (!("requestId" in request) || !BRIDGE_OPERATIONS.includes(request.operation)) {
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
    logConnectionAttemptFailure("MCP中継のクライアント登録に失敗しました", error);
    recordConnectionFailure();
    return;
  }

  await new Promise<void>((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${MCP_BRIDGE_WS_URL}?clientId=${encodeURIComponent(clientId)}`);
    } catch (error: unknown) {
      logConnectionAttemptFailure("WebSocket接続の開始に失敗しました", error);
      recordConnectionFailure();
      resolve();
      return;
    }
    webSocket = socket;
    let settled = false;
    let opened = false;
    // 一つの接続の試みは、タイムアウトと切断のどちらか先に起きた方だけで失敗として数える。
    let failureReported = false;
    const reportFailure = () => {
      if (failureReported) return;
      failureReported = true;
      recordConnectionFailure();
    };
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
      reportFailure();
      settle();
    }, WS_CONNECT_TIMEOUT_MS);
    socket.onopen = () => {
      opened = true;
      if (waitingForServer) {
        waitingForServer = false;
        console.info("[ChLens MCP] MCPサーバーに接続しました。");
      }
      resetConnectionFailures();
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
      // 一度つながった後の切断は通常の再接続として扱い、接続できなかった試みだけを失敗として数える。
      if (opened) {
        scheduleReconnect();
      } else {
        reportFailure();
      }
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
    logConnectionAttemptFailure("MCP中継へのHTTP接続に失敗しました", error);
    recordConnectionFailure();
    // アラームで再試行する。サーバー未起動時も処理を止めず、次の確認で復旧を試みる。
  } finally {
    httpPollInFlight = false;
  }
}

async function ensureAlarm(): Promise<void> {
  if (!browser.alarms) return;
  const alarm = await browser.alarms.get(MCP_BRIDGE_ALARM_NAME);
  // 既存のアラームが旧周期（1分）のままなら作り直して新しい周期を反映する。
  if (!alarm || alarm.periodInMinutes !== HTTP_RETRY_ALARM_MINUTES) {
    await browser.alarms.create(MCP_BRIDGE_ALARM_NAME, {
      periodInMinutes: HTTP_RETRY_ALARM_MINUTES,
    });
  }
}

async function onAlarm(alarm: browser.Alarms.Alarm): Promise<void> {
  if (alarm.name !== MCP_BRIDGE_ALARM_NAME) return;
  // 見つからない間は、決めた間隔が過ぎるまで起床しても接続も取得も試みない。
  if (Date.now() < nextAttemptAt) return;
  await connectWebSocket();
  if (Date.now() >= nextAttemptAt) await pollHttpOnce();
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
    resumeConnection();
  });
  browser.runtime.onInstalled.addListener(() => {
    void ensureAlarm();
    resumeConnection();
  });
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isWorkerStateMessage(message)) return;
    // 利用者がMCPを使うスレッドを開いたときは、見つからない間でも待たずに確認する。
    resumeConnectionIfWaiting();
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
