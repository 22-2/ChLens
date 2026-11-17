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
const RETRY_AT_KEY = "chlensMcpRetryAt";
const THREAD_RETRY_USED_KEY = "chlensMcpThreadRetryUsed";

class RelayUnavailableError extends Error {}

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
let webSocket: WebSocket | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
let httpPollInFlight = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let connectInFlight: Promise<string | null> | null = null;
let lastConnectionErrorAt = 0;
let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
let consecutiveConnectionFailures = 0;
// 0なら通常接続中。待機中はアラームから次に接続を試みる時刻を保持する。
let nextAttemptAt = 0;
let threadRetryUsed = false;

function logConnectionError(message: string, error: unknown): void {
  const now = Date.now();
  // 変更理由: 想定外の失敗を記録する。詳細は保持しつつ30秒に一度へ制限する。
  if (now - lastConnectionErrorAt < CONNECTION_LOG_INTERVAL_MS) return;
  lastConnectionErrorAt = now;
  console.error(`[ChLens MCP] ${message}:`, error);
}

async function restoreRetryState(): Promise<void> {
  // Chromeのサービスワーカーが休止しても、同じブラウザーセッションでは待機を引き継ぐ。
  try {
    const state = await browser.storage.session?.get([RETRY_AT_KEY, THREAD_RETRY_USED_KEY]);
    const retryAt = state?.[RETRY_AT_KEY];
    if (typeof retryAt === "number") nextAttemptAt = retryAt;
    threadRetryUsed = state?.[THREAD_RETRY_USED_KEY] === true;
  } catch (error: unknown) {
    logConnectionError("MCP中継の再試行状態の復元に失敗しました", error);
  }
}

function saveRetryState(): void {
  void browser.storage.session
    ?.set({ [RETRY_AT_KEY]: nextAttemptAt, [THREAD_RETRY_USED_KEY]: threadRetryUsed })
    .catch((error: unknown) => {
      logConnectionError("MCP中継の再試行状態の保存に失敗しました", error);
    });
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
  const alreadyWaiting = nextAttemptAt !== 0;
  if (!alreadyWaiting && consecutiveConnectionFailures < QUICK_CONNECTION_ATTEMPTS) {
    scheduleReconnect();
    return;
  }
  // 数秒おきのタイマーは、休止したサービスワーカーでは止まる。一分ごとの確認は、
  // 起床の合図になるアラームに任せる。
  nextAttemptAt = Date.now() + WAITING_RECONNECT_INTERVAL_MS;
  saveRetryState();
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (!alreadyWaiting) {
    console.info("[ChLens MCP] MCP中継に接続できないため、1分ごとに接続を確認します。");
  }
}

/** 接続できたら、失敗の数と再接続の間隔を初めからにする。 */
function resetConnectionFailures(): void {
  consecutiveConnectionFailures = 0;
  resetReconnectDelay();
  if (nextAttemptAt !== 0) {
    nextAttemptAt = 0;
    threadRetryUsed = false;
    saveRetryState();
  }
}

/** 失敗の数を初めからにして、すぐに接続を試みる。拡張機能の起動・インストール時に使う。 */
function resumeConnection(): void {
  resetConnectionFailures();
  void connectWebSocket();
}

/** 一度の待機につき一回だけ、スレッド表示をきっかけに接続を前倒しする。 */
function resumeConnectionIfWaiting(): void {
  if (nextAttemptAt === 0 || threadRetryUsed || connectInFlight) return;
  // スレッド切り替えによる状態同期の連続で、短い間隔の再試行に戻るのを防ぐ。
  threadRetryUsed = true;
  saveRetryState();
  void connectWebSocket();
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
    }).catch((error: unknown) => {
      // 中継の停止による通信失敗と、HTTP応答やJSONの異常を区別する。
      if (error instanceof TypeError) {
        throw new RelayUnavailableError("MCP中継に到達できません", { cause: error });
      }
      throw error;
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

async function connectWebSocket(): Promise<string | null> {
  if (connectInFlight) return connectInFlight;
  const connection = connectWebSocketOnce();
  connectInFlight = connection;
  try {
    return await connection;
  } finally {
    connectInFlight = null;
  }
}

async function connectWebSocketOnce(): Promise<string | null> {
  if (
    webSocket &&
    (webSocket.readyState === WebSocket.OPEN || webSocket.readyState === WebSocket.CONNECTING)
  ) {
    return null;
  }

  let clientId: string;
  try {
    clientId = await registerClient();
  } catch (error: unknown) {
    if (!(error instanceof RelayUnavailableError)) {
      logConnectionError("MCP中継のクライアント登録に失敗しました", error);
    }
    recordConnectionFailure();
    return null;
  }

  if (typeof WebSocket === "undefined") return clientId;
  await new Promise<void>((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${MCP_BRIDGE_WS_URL}?clientId=${encodeURIComponent(clientId)}`);
    } catch (error: unknown) {
      logConnectionError("WebSocket接続の開始に失敗しました", error);
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
      if (nextAttemptAt !== 0) {
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
  return clientId;
}

async function pollHttpOnce(clientId: string): Promise<void> {
  if (httpPollInFlight || webSocket) return;
  httpPollInFlight = true;
  try {
    const result = await postJson<PollResponse>("/v1/poll", { clientId });
    if (!result.request) return;
    const response = await executeWorkerRequest(result.request);
    await postJson("/v1/respond", {
      clientId,
      requestId: result.request.requestId,
      response,
    });
  } catch (error: unknown) {
    if (!(error instanceof RelayUnavailableError)) {
      logConnectionError("MCP中継へのHTTP接続に失敗しました", error);
    }
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
  const clientId = await connectWebSocket();
  // 登録先はどちらの通信方式でも同じなので、登録に失敗した時にHTTP側で重ねて試さない。
  if (clientId) await pollHttpOnce(clientId);
}

export function startMcpWorker(): void {
  if (started || !browser.alarms) return;
  started = true;
  const retryStateReady = restoreRetryState();
  browser.alarms.onAlarm.addListener((alarm) => {
    void retryStateReady
      .then(() => onAlarm(alarm))
      .catch((error: unknown) => {
        logConnectionError("MCP中継アラームの処理に失敗しました", error);
      });
  });
  browser.runtime.onStartup.addListener(() => {
    void retryStateReady.then(resumeConnection);
  });
  browser.runtime.onInstalled.addListener(() => {
    void retryStateReady.then(resumeConnection);
  });
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isWorkerStateMessage(message)) return;
    if (message.activeThreadUrl) void retryStateReady.then(resumeConnectionIfWaiting);
    void persistWorkerState(message.activeThreadUrl ?? null, message.format2chnet ?? null).catch(
      (error: unknown) => {
        console.error("[ChLens MCP] 現在スレッド情報の保存に失敗しました:", error);
      },
    );
  });
  void ensureAlarm().catch((error: unknown) => {
    console.error("[ChLens MCP] MCP用アラームの登録に失敗しました:", error);
  });
  void retryStateReady.then(() => {
    if (nextAttemptAt === 0) void connectWebSocket();
  });
}
