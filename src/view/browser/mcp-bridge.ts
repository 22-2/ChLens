import { ChURL } from "packages/ch-lib/src/index";
import Cache from "src/core/Cache";
import { toCanonicalThread } from "src/core/thread-model-adapter";
import { getThreadXhrInfo, parseThread } from "src/core/ThreadParser";
import {
  type BridgeFailure,
  type BridgeLogResult,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeSuccess,
  type BridgeThreadResult,
  type LogSearchParams,
  MCP_BRIDGE_BASE_URL,
  type ThreadReadParams,
} from "src/mcp/protocol";
import { encodeLogsForMcp, encodeThreadForMcp } from "src/mcp/thread-output";
import { container } from "src/service-container/index";
import type { IRes, IThreadDetail } from "src/service-container/interfaces";

const REQUEST_TIMEOUT_MS = 35_000;
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

interface RegisterResponse {
  clientId: string;
}

interface PollResponse {
  request: BridgeRequest | null;
}

interface BrowserMcpWindow extends Window {
  __chLensMcpActiveThreadUrl?: string;
}

interface CachedThreadRes {
  name?: string;
  mail?: string;
  message?: string;
  other?: string;
  id?: string;
}

interface CachedThread {
  title?: string;
  res?: CachedThreadRes[];
  expired?: boolean;
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

function getWindowState(): BrowserMcpWindow {
  return window as BrowserMcpWindow;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asThreadParams(value: unknown): ThreadReadParams {
  const raw = asRecord(value);
  const params: ThreadReadParams = {};
  if (typeof raw.url === "string") {
    params.url = raw.url;
  }
  if (raw.mode === "auto" || raw.mode === "cache" || raw.mode === "refresh") {
    params.mode = raw.mode;
  }
  for (const key of ["start", "end", "first", "last", "popular"] as const) {
    if (typeof raw[key] === "number") {
      params[key] = raw[key] as number;
    }
  }
  return params;
}

function asLogParams(value: unknown): LogSearchParams {
  const raw = asRecord(value);
  return {
    ...(typeof raw.query === "string" ? { query: raw.query } : {}),
    ...(typeof raw.limit === "number" ? { limit: raw.limit } : {}),
  };
}

function normalizeThreadUrl(rawUrl: string): string {
  const url = new ChURL(rawUrl);
  if (url.type !== "thread") {
    throw new Error("スレッドURLを指定してください");
  }
  return url.url.href;
}

function resolveActiveThreadUrl(): string | null {
  const activeUrl = getWindowState().__chLensMcpActiveThreadUrl?.trim();
  if (activeUrl) return activeUrl;

  // 変更理由: 古い画面やテスト用ページではアクティブスレッドの共有値を持たないため、
  // 起動時クエリを最後のフォールバックとして使い、URL指定なしの要求も救済する。
  const queryUrl = new URL(window.location.href).searchParams.get("q")?.trim();
  return queryUrl || null;
}

function canonicalToThreadDetail(
  url: string,
  canonical: ReturnType<typeof toCanonicalThread>,
  title: string,
  expired = false,
): IThreadDetail {
  const responses: IRes[] = canonical.posts.map((post) => ({
    num: post.number,
    name: post.name,
    mail: post.mail,
    date: post.date,
    id: post.id,
    slip: post.slip,
    trip: post.trip,
    be: post.be,
    other: post.other,
    message: post.message,
  }));
  return {
    url,
    title,
    res: responses,
    expired,
  };
}

async function readCachedThread(url: string): Promise<IThreadDetail> {
  const normalizedUrl = normalizeThreadUrl(url);
  const chUrl = new ChURL(normalizedUrl);
  const format2chnet = container.config.get("format_2chnet");
  const xhrInfo = getThreadXhrInfo(chUrl, format2chnet);
  if (!xhrInfo) {
    throw new Error("対応していないスレッドURLです");
  }

  const cache = container.cache.getCache(xhrInfo.path);
  await cache.get();
  let parsed: CachedThread | null = null;
  if (cache.parsed && typeof cache.parsed === "object") {
    const candidate = cache.parsed as CachedThread;
    if (Array.isArray(candidate.res)) {
      parsed = candidate;
    }
  }
  if (!parsed && cache.data) {
    parsed = parseThread(chUrl, cache.data, { format2chnet }) as CachedThread | null;
  }
  if (!parsed?.res || parsed.res.length === 0) {
    throw new Error("保存済みログに本文がありません");
  }

  const canonical = toCanonicalThread({
    title: parsed.title,
    res: parsed.res.map((response) => ({
      name: response.name ?? "名無し",
      mail: response.mail ?? "",
      message: response.message ?? "",
      other: response.other ?? "",
      ...(response.id ? { id: response.id } : {}),
    })),
  });
  return canonicalToThreadDetail(
    normalizedUrl,
    canonical,
    parsed.title ?? cache.title ?? "",
    parsed.expired,
  );
}

async function readThread(params: ThreadReadParams): Promise<BridgeThreadResult> {
  const url = normalizeThreadUrl(params.url?.trim() || resolveActiveThreadUrl() || "");
  const mode = params.mode === "cache" || params.mode === "refresh" ? params.mode : "auto";
  const thread =
    mode === "cache"
      ? await readCachedThread(url)
      : await container.thread.getThread(url, { forceUpdate: mode === "refresh" });

  if (thread.res.length === 0 && thread.message) {
    throw new Error(thread.message);
  }

  const encoded = encodeThreadForMcp(thread, params, mode);
  return {
    kind: "thread",
    title: thread.title ?? "",
    url: thread.url || url,
    totalResponses: encoded.totalResponses,
    selectedResponses: encoded.selectedResponses,
    source: mode,
    toon: encoded.toon,
  };
}

async function searchLogs(params: LogSearchParams): Promise<BridgeLogResult> {
  const query = params.query?.trim() ?? "";
  const requestedLimit = params.limit ?? 20;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 20;
  const logs = (query ? await Cache.searchLogs(query) : await Cache.listLogs()).slice(0, limit);
  return {
    kind: "logs",
    query,
    count: logs.length,
    toon: encodeLogsForMcp(query, logs),
  };
}

async function executeRequest(request: BridgeRequest): Promise<BridgeResponse> {
  try {
    let result: BridgeThreadResult | BridgeLogResult;
    switch (request.operation) {
      case "read-thread":
        result = await readThread(asThreadParams(request.params));
        break;
      case "search-logs":
        result = await searchLogs(asLogParams(request.params));
        break;
      default: {
        const operation: never = request.operation;
        throw new Error(`未対応の操作です: ${String(operation)}`);
      }
    }
    return { requestId: request.requestId, ok: true, result } satisfies BridgeSuccess<
      BridgeThreadResult | BridgeLogResult
    >;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ChLens MCP] ブリッジ要求の処理に失敗しました:", error);
    return { requestId: request.requestId, ok: false, error: message } satisfies BridgeFailure;
  }
}

class BrowserMcpBridge {
  private connected = false;

  async run(): Promise<void> {
    let retryMilliseconds = INITIAL_RETRY_MS;
    while (true) {
      try {
        const registration = await this.post<RegisterResponse>("/v1/register", {});
        this.connected = true;
        retryMilliseconds = INITIAL_RETRY_MS;
        await this.poll(registration.clientId);
      } catch (error: unknown) {
        if (this.connected) {
          console.error("[ChLens MCP] ローカル中継との接続が切断されました:", error);
        }
        this.connected = false;
        await wait(retryMilliseconds);
        retryMilliseconds = Math.min(MAX_RETRY_MS, retryMilliseconds * 2);
      }
    }
  }

  private async poll(clientId: string): Promise<void> {
    while (true) {
      const response = await this.post<PollResponse>("/v1/poll", { clientId });
      if (!response.request) {
        continue;
      }

      const result = await executeRequest(response.request);
      await this.post("/v1/respond", {
        clientId,
        requestId: response.request.requestId,
        response: result,
      });
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${MCP_BRIDGE_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`中継HTTPエラー (${response.status})`);
      }
      return (await response.json()) as T;
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

let started = false;

export function startMcpBridge(): void {
  if (started) return;
  started = true;
  // 変更理由: MCPサーバーは必要なときだけ起動されるため、Chrome側は画面起動後に
  // 接続を試し続ける。サーバー不在時は指数バックオフし、通常利用の通信を圧迫しない。
  void new BrowserMcpBridge().run();
}
