import { fetchHttpsFirst } from "packages/chlib/src/fetcher/https-first";
import { createLogger } from "src/app/logger";
import { getHttpsMode } from "src/app/platform/https-mode";
import { QueuedHttpClient } from "src/app/platform/QueuedHttpClient";
import { getWebAssetPath } from "src/app/platform/runtime";
import type { BinaryHttpResponse, HttpClient, HttpRequestOptions } from "src/app/platform/types";

const logger = createLogger("platform");

/** 公開版は別オリジンの中継を使い、未指定ならローカルプレビューへ接続する。 */
export function resolveWebProxyUrl(configured: string): URL {
  if (!configured) return new URL(getWebAssetPath("__chlens_web_proxy"), window.location.origin);
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Web版の中継先URLが不正です");
  }
  return url;
}

async function fetchBinary(
  url: string,
  options: HttpRequestOptions = {},
): Promise<BinaryHttpResponse> {
  if (options.method && options.method.toUpperCase() !== "GET") {
    throw new Error("Web試用版は読み取り専用です");
  }
  return fetchHttpsFirst(
    url,
    "GET",
    async (target) => {
      const controller = new AbortController();
      const timeout = options.timeout
        ? setTimeout(() => controller.abort(), options.timeout)
        : undefined;
      try {
        const configured =
          typeof __CHLENS_WEB_PROXY_URL__ === "undefined" ? "" : __CHLENS_WEB_PROXY_URL__;
        const proxyUrl = resolveWebProxyUrl(configured);
        proxyUrl.searchParams.set("url", target);
        const response = await fetch(proxyUrl, {
          headers: options.headers,
          signal: controller.signal,
        });
        const headers = Object.fromEntries(response.headers.entries());
        return {
          status: response.status,
          headers: { ...headers, ETag: headers.etag, "Last-Modified": headers["last-modified"] },
          body: await response.arrayBuffer(),
          url: response.headers.get("x-chlens-final-url") ?? target,
        };
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
    options.headers,
    options.httpsMode ?? getHttpsMode(),
  );
}

// 拡張機能のバックグラウンドと同じキューを使い、同一画面からのアクセスを抑制する。
export const WebHttpClient: HttpClient = new QueuedHttpClient({
  async fetch(url, options = {}) {
    const result = await fetchBinary(url, options);
    const charset = /charset=([^;\s]+)/i.exec(options.mimeType ?? "")?.[1] ?? "utf-8";
    try {
      return {
        ...result,
        body: new TextDecoder(charset.toLowerCase() === "x-sjis" ? "Shift_JIS" : charset).decode(
          result.body,
        ),
      };
    } catch (error) {
      logger.error("Web版HTTP応答のデコードに失敗しました:", error);
      throw error;
    }
  },
  fetchBinary,
  async setupWriteHeaders() {
    throw new Error("Web試用版では書き込みに対応していません");
  },
});
