import type { IncomingMessage, ServerResponse } from "node:http";

import { isCompatibleBoardHost } from "../packages/chlib/src/url/hosts";

const PROXY_PATH = "/__chlens_web_proxy";
const FORWARDED_HEADERS = ["if-none-match", "if-modified-since", "range"];
const RESPONSE_HEADERS = ["content-type", "content-range", "etag", "last-modified", "retry-after"];

function validateTarget(raw: string): URL {
  const target = new URL(raw);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.port ||
    !isCompatibleBoardHost(target.hostname)
  ) {
    throw new Error("対応していない掲示板URLです");
  }
  return target;
}

/** ローカル試用だけで利用する、読み取り専用の掲示板中継。 */
export async function handleWebPreviewProxy(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    if (request.method !== "GET") {
      response.writeHead(405, { allow: "GET" }).end();
      return;
    }
    // 外部サイトから利用者のローカル中継を呼ばれないよう、ブラウザの同一オリジン要求だけを受ける。
    const host = request.headers.host;
    if (
      !host ||
      (request.headers.origin && request.headers.origin !== `http://${host}`) ||
      (request.headers["sec-fetch-site"] && request.headers["sec-fetch-site"] !== "same-origin")
    ) {
      response.writeHead(403).end("同一オリジンからの要求だけを受け付けます");
      return;
    }
    const requestUrl = new URL(request.url ?? "", `http://${host}`);
    let target = validateTarget(requestUrl.searchParams.get("url") ?? "");
    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers[name];
      if (typeof value === "string") headers.set(name, value);
    }
    for (let redirects = 0; redirects <= 5; redirects++) {
      // 転送先がローカルや無関係なサイトへ変わらないよう、リダイレクトごとに検証する。
      const upstream = await fetch(target, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      });
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        const location = upstream.headers.get("location");
        if (!location || redirects === 5) throw new Error("リダイレクト先を取得できません");
        target = validateTarget(new URL(location, target).href);
        continue;
      }
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) response.setHeader(name, value);
      }
      response.setHeader("x-chlens-final-url", target.href);
      response.writeHead(upstream.status).end(new Uint8Array(await upstream.arrayBuffer()));
      return;
    }
  } catch (error) {
    console.error("[web-preview] 掲示板の取得に失敗しました:", error);
    if (!response.headersSent) response.writeHead(502).end("掲示板の取得に失敗しました");
  }
}

export function webPreviewProxyPlugin() {
  return {
    name: "chlens-web-preview-proxy",
    configurePreviewServer(server: import("vite").PreviewServer) {
      server.middlewares.use(PROXY_PATH, (request, response) => {
        void handleWebPreviewProxy(request, response);
      });
    },
  };
}
