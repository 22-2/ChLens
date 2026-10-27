import { fetchHttpsFirst } from "packages/chlib/src/fetcher/https-first";
import { createLogger } from "src/app/logger";
import { decodeBase64ArrayBuffer, encodeBase64 } from "src/app/platform/binary";
import { applyUserAgentRule } from "src/app/platform/browser/user-agent-rule";
import { QueuedHttpClient } from "src/app/platform/QueuedHttpClient";
import type {
  BinaryHttpResponse,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from "src/app/platform/types";

import { isSharedHttpRequestMessage, type SharedHttpResponseMessage } from "./shared-http-protocol";

const logger = createLogger("platform");

async function fetchBinaryResponse(
  url: string,
  options: HttpRequestOptions = {},
): Promise<BinaryHttpResponse> {
  return fetchHttpsFirst(
    url,
    options.method,
    async (requestUrl) => {
      const controller = new AbortController();
      const timeout = options.timeout
        ? setTimeout(() => controller.abort(), options.timeout)
        : undefined;
      try {
        // fetchではUser-Agentを上書きできないため、取得先ごとのDNRルールで差し替える。
        if (options.userAgent !== undefined) {
          await applyUserAgentRule(requestUrl, options.userAgent);
        }
        const response = await fetch(requestUrl, {
          method: options.method ?? "GET",
          headers: options.headers,
          body: options.body == null ? undefined : options.body,
          signal: controller.signal,
        });
        return {
          status: response.status,
          headers: Object.fromEntries(
            [...response.headers.entries()].map(([name, value]) => [
              name === "etag" ? "ETag" : name === "last-modified" ? "Last-Modified" : name,
              value,
            ]),
          ),
          body: await response.arrayBuffer(),
          url: response.url || requestUrl,
        };
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
    options.headers,
    options.httpsMode,
  );
}

const transport: HttpClient = {
  async fetch(url, options = {}): Promise<HttpResponse> {
    const response = await fetchBinaryResponse(url, options);
    const mimeCharset = /charset=([^;\s]+)/i.exec(options.mimeType ?? "")?.[1];
    const charset =
      mimeCharset?.toLowerCase() === "x-sjis" ? "Shift_JIS" : (mimeCharset ?? "utf-8");
    let body: string;
    try {
      body = new TextDecoder(charset).decode(response.body);
    } catch (error) {
      logger.error("バックグラウンドHTTP応答のデコードに失敗しました:", error);
      body = new TextDecoder().decode(response.body);
    }
    return { ...response, body };
  },
  fetchBinary: fetchBinaryResponse,
  async setupWriteHeaders() {},
};

const queuedTransport = new QueuedHttpClient(transport);

/** 全拡張機能ウィンドウで共有するHTTP要求ハンドラー。 */
export async function handleSharedHttpRequest(
  message: unknown,
): Promise<SharedHttpResponseMessage | undefined> {
  if (!isSharedHttpRequestMessage(message)) return undefined;

  try {
    const serializedOptions = message.options;
    const options: HttpRequestOptions | undefined = serializedOptions
      ? {
          method: serializedOptions.method,
          headers: serializedOptions.headers,
          timeout: serializedOptions.timeout,
          mimeType: serializedOptions.mimeType,
          httpsMode: serializedOptions.httpsMode,
          userAgent: serializedOptions.userAgent,
          body:
            serializedOptions.bodyBase64 !== undefined
              ? decodeBase64ArrayBuffer(serializedOptions.bodyBase64)
              : serializedOptions.body,
        }
      : undefined;
    if (message.responseType === "binary") {
      // 拡張機能のメッセージはArrayBufferを安全に運べないため、境界でだけBase64へ変換する。
      const response = await queuedTransport.fetchBinary!(message.url, options);
      const { body, ...metadata } = response;
      return {
        ok: true,
        responseType: "binary",
        response: { ...metadata, bodyBase64: encodeBase64(new Uint8Array(body)) },
      };
    }
    const response = await queuedTransport.fetch(message.url, options);
    return { ok: true, response };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
