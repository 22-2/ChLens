import {
  executeThreadFetch,
  getThreadArchiveFallbacks,
  getThreadXhrInfo,
  isHtmlThread,
  type ParsedThread,
  parseThread,
  type ThreadResponse,
  toCanonicalThread,
} from "@chlen/ch-lib";
import browser from "webextension-polyfill";

import { ChURL } from "../../packages/ch-lib/src/url/ChURL";
import type { HttpResponse } from "../app/platform/types";
import type { IRes } from "../service-container/interfaces";
import { encodeBrowsingHistoryForMcp, encodeWriteHistoryForMcp } from "./history-output";
import {
  type BridgeFailure,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeSuccess,
  type BridgeThreadResult,
  type BrowsingHistoryParams,
  type LogSearchParams,
  type ThreadReadParams,
  type WriteHistoryParams,
} from "./protocol";
import { encodeLogsForMcp, encodeThreadForMcp } from "./thread-output";
import {
  getWorkerCache,
  listWorkerLogs,
  putWorkerCache,
  type WorkerCacheRecord,
} from "./worker-cache";
import { listRecentBrowsingHistory, listRecentWriteHistory } from "./worker-history";

const ACTIVE_THREAD_KEY = "mcp_active_thread_url";
const FORMAT_KEY = "mcp_format_2chnet";
const FRESH_CACHE_MS = 3_000;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asThreadParams(value: unknown): ThreadReadParams {
  const raw = asRecord(value);
  const params: ThreadReadParams = {};
  if (typeof raw.url === "string") params.url = raw.url;
  if (raw.mode === "auto" || raw.mode === "cache" || raw.mode === "refresh") {
    params.mode = raw.mode;
  }
  for (const key of ["start", "end", "first", "last", "popular"] as const) {
    if (typeof raw[key] === "number") params[key] = raw[key] as number;
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

function asWriteHistoryParams(value: unknown): WriteHistoryParams {
  const raw = asRecord(value);
  return {
    ...(typeof raw.query === "string" ? { query: raw.query } : {}),
    ...(typeof raw.limit === "number" ? { limit: raw.limit } : {}),
  };
}

function asBrowsingHistoryParams(value: unknown): BrowsingHistoryParams {
  const raw = asRecord(value);
  return {
    ...(typeof raw.query === "string" ? { query: raw.query } : {}),
    ...(typeof raw.limit === "number" ? { limit: raw.limit } : {}),
  };
}

function normalizeHistoryLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.floor(limit as number)));
}

function normalizeThreadUrl(rawUrl: string): string {
  try {
    const input = new URL(rawUrl);
    const eddibbDat = /^\/([\w-]+)\/dat\/(\d+)\.dat\/?$/i.exec(input.pathname);
    if (input.hostname.toLowerCase() === "bbs.eddibb.cc" && eddibbDat) {
      // 変更理由: eddibbのdat直リンクはChURLの通常入口より先に専用形式で判定されるため、
      // MCPへ貼られた保存先URLもread.cgi形式へ揃えて既存の取得計画を再利用する。
      input.pathname = `/test/read.cgi/${eddibbDat[1]}/${eddibbDat[2]}/`;
    }
    const url = new ChURL(input);
    if (url.type !== "thread") throw new Error("スレッドURLを指定してください");
    return url.url.href;
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "スレッドURLを指定してください") throw error;
    throw new Error("スレッドURLを指定してください");
  }
}

async function readStoredString(key: string): Promise<string | null> {
  try {
    const result = await browser.storage.local.get(key);
    const value = result[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch (error: unknown) {
    // 変更理由: 古いFirefoxビルドやテスト環境でstorageが一時的に使えなくても、
    // URL指定のMCP要求は継続できるよう、設定値だけ既定値へフォールバックする。
    console.error("[ChLens MCP] 背景設定の読み込みに失敗しました:", error);
    return null;
  }
}

async function resolveActiveThreadUrl(): Promise<string | null> {
  const stored = await readStoredString(ACTIVE_THREAD_KEY);
  if (stored) return stored;

  // 画面を閉じる前にURLを保存できなかった場合の救済。タブURLは初回起動時の
  // qパラメータを持つため、サービスワーカー単独でも最低限の現在スレッドを復元できる。
  try {
    const tabs = await browser.tabs.query({ url: `${browser.runtime.getURL("view/index.html")}*` });
    const tab = tabs.find((candidate) => typeof candidate.url === "string");
    if (!tab?.url) return null;
    return new URL(tab.url).searchParams.get("q")?.trim() || null;
  } catch (error: unknown) {
    console.error("[ChLens MCP] 現在スレッドの復元に失敗しました:", error);
    return null;
  }
}

async function resolveFormat2chnet(): Promise<string> {
  return (await readStoredString(FORMAT_KEY)) ?? "html";
}

function isParsedThread(value: unknown): value is ParsedThread {
  const record = asRecord(value);
  return (
    Array.isArray(record.res) &&
    record.res.every((response) => {
      const item = asRecord(response);
      return (
        typeof item.name === "string" &&
        typeof item.mail === "string" &&
        typeof item.message === "string" &&
        typeof item.other === "string"
      );
    })
  );
}

function getCachedParsed(record: WorkerCacheRecord | null, chUrl: ChURL, format2chnet: string) {
  if (!record) return null;
  if (isParsedThread(record.parsed)) return record.parsed;
  if (record.data) return parseThread(chUrl, record.data, { format2chnet });
  return null;
}

function canonicalToDetail(
  url: string,
  parsed: ParsedThread,
  title: string,
): {
  url: string;
  title: string;
  res: IRes[];
  expired?: boolean;
} {
  const canonical = toCanonicalThread(parsed);
  return {
    url,
    title: title || canonical.title || "",
    res: canonical.posts.map((post) => ({
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
    })),
    ...(parsed.expired ? { expired: true } : {}),
  };
}

function canonicalToLegacy(parsed: ParsedThread): ParsedThread {
  return {
    ...(parsed.title === undefined ? {} : { title: parsed.title }),
    res: parsed.res.map((response) => ({ ...response })),
    ...(parsed.expired ? { expired: true } : {}),
  };
}

function headerValue(response: ThreadResponse, name: string): string | null {
  const normalizedName = name.toLowerCase();
  const entry = Object.entries(response.headers ?? {}).find(
    ([key]) => key.toLowerCase() === normalizedName,
  );
  return entry?.[1] ?? null;
}

function extractReadcgiVersion(body: string): number | null {
  const marker = '<div class="footer push">read.cgi ver ';
  const index = body.indexOf(marker);
  if (index < 0) return null;
  const version = Number.parseInt(body.slice(index + marker.length, index + marker.length + 2), 10);
  return Number.isFinite(version) ? version : null;
}

function toHttpResponse(response: Response, body: string, url: string): HttpResponse {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return { status: response.status, headers, body, url };
}

function isSuccessfulThreadResponse(status: number, readcgiVer: number): boolean {
  return status === 200 || status === 304 || (readcgiVer >= 6 && status === 500);
}

async function saveThreadCache(
  cacheKey: string,
  url: string,
  chUrl: ChURL,
  parsed: ParsedThread,
  rawData: string | null,
  response: ThreadResponse,
  readcgiVer: number,
  previous: WorkerCacheRecord | null,
): Promise<void> {
  let boardUrl = previous?.board_url ?? null;
  try {
    boardUrl = chUrl.toBoard().url.href;
  } catch {
    // 不正な板URLでは既存値を維持する。
  }

  const lastModified = headerValue(response, "last-modified");
  const parsedLastModified = lastModified ? Date.parse(lastModified) : Number.NaN;
  await putWorkerCache({
    url: cacheKey,
    data: rawData ?? previous?.data ?? null,
    parsed: canonicalToLegacy(parsed),
    last_updated: Date.now(),
    last_modified: Number.isFinite(parsedLastModified)
      ? parsedLastModified
      : (previous?.last_modified ?? null),
    etag: headerValue(response, "etag") ?? previous?.etag ?? null,
    res_length: parsed.res.length,
    dat_size: rawData?.length ?? previous?.dat_size ?? null,
    readcgi_ver: readcgiVer,
    title: parsed.title ?? previous?.title ?? null,
    thread_url: url,
    board_url: boardUrl,
    board_title: previous?.board_title ?? null,
    kind: "thread",
  });
}

async function readCachedThread(
  url: string,
  chUrl: ChURL,
  format2chnet: string,
  record: WorkerCacheRecord | null,
  params: ThreadReadParams,
): Promise<BridgeThreadResult> {
  const parsed = getCachedParsed(record, chUrl, format2chnet);
  if (!parsed || parsed.res.length === 0) {
    throw new Error("保存済みログに本文がありません");
  }
  const detail = canonicalToDetail(url, parsed, parsed.title ?? record?.title ?? "");
  const encoded = encodeThreadForMcp(detail, params, "cache");
  return {
    kind: "thread",
    title: detail.title,
    url,
    totalResponses: encoded.totalResponses,
    selectedResponses: encoded.selectedResponses,
    source: "cache",
    toon: encoded.toon,
  };
}

async function readThread(params: ThreadReadParams): Promise<BridgeThreadResult> {
  const rawUrl = params.url?.trim() || (await resolveActiveThreadUrl()) || "";
  const url = normalizeThreadUrl(rawUrl);
  const chUrl = new ChURL(url);
  const format2chnet = await resolveFormat2chnet();
  const xhrInfo = getThreadXhrInfo(chUrl, format2chnet);
  if (!xhrInfo) throw new Error("対応していないスレッドURLです");

  const mode = params.mode === "cache" || params.mode === "refresh" ? params.mode : "auto";
  const cache = await getWorkerCache(xhrInfo.path);
  const cachedParsed = getCachedParsed(cache, chUrl, format2chnet);
  if (mode === "cache") return readCachedThread(url, chUrl, format2chnet, cache, params);

  if (
    mode === "auto" &&
    cachedParsed &&
    cache?.last_updated != null &&
    Date.now() - cache.last_updated <= FRESH_CACHE_MS
  ) {
    const detail = canonicalToDetail(url, cachedParsed, cachedParsed.title ?? cache.title ?? "");
    const encoded = encodeThreadForMcp(detail, params, mode);
    return {
      kind: "thread",
      title: detail.title,
      url,
      totalResponses: encoded.totalResponses,
      selectedResponses: encoded.selectedResponses,
      source: mode,
      toon: encoded.toon,
    };
  }

  // 変更理由: MCPの背景取得は画面の自動更新とは独立させ、サービスワーカーから
  // 直接取得する。既存の差分計画と条件付きヘッダーを共有し、同じURLを短時間に
  // 何度も要求しても掲示板へ不要な全量通信を送らない。
  const isHtml = isHtmlThread(chUrl, format2chnet);
  // 変更理由: 画面側と同じ取得実行器を使い、差分URL・条件付きヘッダー・
  // 文字コード変換・レスポンス合成の規則がMCPだけ別になるのを防ぐ。
  const execution = await executeThreadFetch(
    {
      tsld: chUrl.getTsld(),
      isArchive: chUrl.isArchive,
      isHtml,
      hasCache: cachedParsed != null,
      basePath: xhrInfo.path,
      cacheResLength: cache?.res_length,
      cacheReadcgiVer: cache?.readcgi_ver,
      charset: xhrInfo.charset,
      lastModified: cache?.last_modified,
      etag: cache?.etag,
      bbsType: chUrl.bbsType,
      cacheData: cache?.data,
      cacheParsed: cachedParsed,
      url: chUrl,
      format2chnet,
      parseThreadFn: parseThread,
    },
    {
      fetch: async (path, charset, headers) => {
        const response = await fetch(path, { headers: { ...headers } });
        const bodyBuffer = await response.arrayBuffer();
        const body = new TextDecoder(charset).decode(bodyBuffer);
        return toHttpResponse(response, body, path);
      },
    },
    // 変更理由: MCPでも画面と同じく通常スレ取得が失敗した場合だけ過去ログを試し、
    // 取得に成功したレスポンスは既存の共通パーサーとキャッシュへ渡す。
    getThreadArchiveFallbacks(chUrl).map(({ url: fallbackUrl, charset }) => ({
      path: fallbackUrl,
      charset,
    })),
  );
  const { plan } = execution;
  const response = execution.response;
  const responseIsHtml = isHtml || execution.usedFallback === true;
  const body = response?.body ?? "";
  const parsed = execution.thread;
  if (!parsed || parsed.res.length === 0 || execution.rejected) {
    // 画面側ThreadServiceと同じく、キャッシュを表示できても異常なHTTP応答は
    // 成功扱いにしない。MCP側で「新しい取得に失敗した」ことを判断できるようにする。
    throw new Error(`スレッドを取得できませんでした (HTTP ${response?.status ?? "unknown"})`);
  }

  const readcgiVer = extractReadcgiVersion(body) ?? cache?.readcgi_ver ?? plan.readcgiVer;
  if (response && isSuccessfulThreadResponse(response.status, readcgiVer)) {
    const nextRawData =
      response.status === 304
        ? null
        : responseIsHtml
          ? null
          : plan.deltaFlg
            ? `${cache?.data ?? ""}${body}`
            : body;
    await saveThreadCache(
      xhrInfo.path,
      url,
      chUrl,
      parsed,
      nextRawData,
      response,
      readcgiVer,
      cache,
    );
  }

  const detail = canonicalToDetail(url, parsed, parsed.title ?? cache?.title ?? "");
  const encoded = encodeThreadForMcp(detail, params, mode);
  return {
    kind: "thread",
    title: detail.title,
    url,
    totalResponses: encoded.totalResponses,
    selectedResponses: encoded.selectedResponses,
    source: mode,
    toon: encoded.toon,
  };
}

async function searchLogs(
  params: LogSearchParams,
): Promise<{ kind: "logs"; query: string; count: number; toon: string }> {
  const query = params.query?.trim() ?? "";
  const requestedLimit = params.limit ?? 20;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 20;
  const logs = await listWorkerLogs(query, limit);
  return { kind: "logs", query, count: logs.length, toon: encodeLogsForMcp(query, logs) };
}

async function readWriteHistory(
  params: WriteHistoryParams,
): Promise<{ kind: "write-history"; query: string; count: number; toon: string }> {
  const query = params.query?.trim() ?? "";
  const writes = await listRecentWriteHistory(query, normalizeHistoryLimit(params.limit));
  return {
    kind: "write-history",
    query,
    count: writes.length,
    toon: encodeWriteHistoryForMcp(query, writes),
  };
}

async function readBrowsingHistory(
  params: BrowsingHistoryParams,
): Promise<{ kind: "browsing-history"; query: string; count: number; toon: string }> {
  const query = params.query?.trim() ?? "";
  const history = await listRecentBrowsingHistory(query, normalizeHistoryLimit(params.limit));
  return {
    kind: "browsing-history",
    query,
    count: history.length,
    toon: encodeBrowsingHistoryForMcp(query, history),
  };
}

export async function executeWorkerRequest(request: BridgeRequest): Promise<BridgeResponse> {
  try {
    let result:
      | BridgeThreadResult
      | { kind: "logs"; query: string; count: number; toon: string }
      | { kind: "write-history"; query: string; count: number; toon: string }
      | { kind: "browsing-history"; query: string; count: number; toon: string };
    if (request.operation === "read-thread") {
      result = await readThread(asThreadParams(request.params));
    } else if (request.operation === "search-logs") {
      result = await searchLogs(asLogParams(request.params));
    } else if (request.operation === "read-write-history") {
      result = await readWriteHistory(asWriteHistoryParams(request.params));
    } else if (request.operation === "read-browsing-history") {
      result = await readBrowsingHistory(asBrowsingHistoryParams(request.params));
    } else {
      // 型定義外の要求を受けても検索へ誤フォールバックさせず、契約違反として返す。
      throw new Error(`未対応の操作です: ${String(request.operation)}`);
    }
    return {
      requestId: request.requestId,
      ok: true,
      result,
    } satisfies BridgeSuccess<
      | BridgeThreadResult
      | { kind: "logs"; query: string; count: number; toon: string }
      | { kind: "write-history"; query: string; count: number; toon: string }
      | { kind: "browsing-history"; query: string; count: number; toon: string }
    >;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ChLens MCP] サービスワーカー要求の処理に失敗しました:", error);
    return { requestId: request.requestId, ok: false, error: message } satisfies BridgeFailure;
  }
}

export async function persistWorkerState(
  activeThreadUrl: string | null,
  format2chnet: string | null,
): Promise<void> {
  const writes: Promise<void>[] = [];
  if (activeThreadUrl) {
    writes.push(browser.storage.local.set({ [ACTIVE_THREAD_KEY]: activeThreadUrl }));
  } else {
    writes.push(browser.storage.local.remove(ACTIVE_THREAD_KEY));
  }
  if (format2chnet) {
    writes.push(browser.storage.local.set({ [FORMAT_KEY]: format2chnet }));
  } else {
    writes.push(browser.storage.local.remove(FORMAT_KEY));
  }
  await Promise.all(writes);
}
