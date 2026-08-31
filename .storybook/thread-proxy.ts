import { isCompatibleBoardHost } from "../packages/ch-lib/src/url/hosts.ts";
import type { Plugin } from "vite";
import { CHLENS_STORYBOOK_THREAD_PROXY_PATH } from "./thread-proxy-path.ts";

function parseThreadUrl(rawUrl: string | null): URL {
  if (!rawUrl) throw new Error("スレッドURLが指定されていません");

  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("httpまたはhttpsのスレッドURLを指定してください");
  }
  if (url.username || url.password || !isCompatibleBoardHost(url.hostname)) {
    throw new Error("対応していない掲示板URLです");
  }
  return url;
}

/**
 * Storybookのブラウザiframeから掲示板へ直接接続するとCORSで取得できないため、
 * 開発サーバーだけに同一オリジンの中継口を用意する。対応掲示板だけに限定し、
 * 任意の外部URLを中継する開発用オープンプロキシにならないようにする。
 */
export function createChLensStorybookThreadProxy(): Plugin {
  return {
    name: "chlens-storybook-thread-proxy",
    configureServer(server) {
      server.middlewares.use(CHLENS_STORYBOOK_THREAD_PROXY_PATH, (request, response) => {
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.setHeader("allow", "GET");
          response.end("GETのみ対応しています");
          return;
        }

        let target: URL;
        try {
          const requestUrl = new URL(request.url ?? "", "http://storybook.local");
          target = parseThreadUrl(requestUrl.searchParams.get("url"));
        } catch (error) {
          response.statusCode = 400;
          response.end(error instanceof Error ? error.message : "不正なスレッドURLです");
          return;
        }

        void fetch(target, { redirect: "follow" })
          .then(async (upstream) => {
            response.statusCode = upstream.status;
            for (const headerName of [
              "cache-control",
              "content-range",
              "content-type",
              "etag",
              "last-modified",
            ]) {
              const value = upstream.headers.get(headerName);
              if (value) response.setHeader(headerName, value);
            }
            response.end(new Uint8Array(await upstream.arrayBuffer()));
          })
          .catch((error: unknown) => {
            console.error("[Storybook] スレッド中継に失敗しました:", target.href, error);
            if (!response.headersSent) {
              response.statusCode = 502;
              response.end("掲示板からスレッドを取得できませんでした");
            }
          });
      });
    },
  };
}
