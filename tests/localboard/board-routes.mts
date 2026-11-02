import { Hono } from "hono";
import iconv from "iconv-lite";

import { TINY_PNG } from "../large-thread.mjs";

export interface LocalThread {
  id: string;
  title: string;
  posts: string[];
}
export interface BoardRouteState {
  threads: LocalThread[];
  getResponseLimit: () => number | null;
  hiddenSubjectThreadIds: Set<string>;
  imageContentLengthOverrides: Map<string, number | null>;
  imageHeadStatusOverrides: Map<string, number>;
  imageBodies: Map<string, { body: Uint8Array; contentType: string }>;
}

export function createBoardRoutes(state: BoardRouteState) {
  const app = new Hono();
  app.all("/img/:file", (c) => {
    const path = c.req.path;
    if (!/^\/img\/\d+\.png$/u.test(path)) return c.notFound();
    const custom = state.imageBodies.get(path);
    const body = custom?.body ?? TINY_PNG;
    const isHead = c.req.method === "HEAD";
    const length = state.imageContentLengthOverrides.has(path)
      ? state.imageContentLengthOverrides.get(path)
      : body.byteLength;
    const headers = new Headers({
      "Content-Type": custom?.contentType ?? "image/png",
      "Cache-Control": "no-store",
    });
    if (isHead && length != null) headers.set("Content-Length", String(length));
    return new Response(isHead ? null : new Uint8Array(body), {
      status: isHead ? (state.imageHeadStatusOverrides.get(path) ?? 200) : 200,
      headers,
    });
  });
  app.all("*", (c) => {
    const path = c.req.path;
    const resources: Record<string, string> = {
      "/bbsmenu.html":
        '<html><head><title>テスト板メニュー</title></head><body>\n<br><br><b>テストカテゴリ</b><br>\n<a href="/local/">ローカルテスト板</a><br>\n</body></html>',
      "/local/SETTING.TXT": `BBS_TITLE=ローカルテスト板\n${state.getResponseLimit() == null ? "" : `BBS_RES_MAX=${state.getResponseLimit()}\n`}`,
      "/local/subject.txt": `${state.threads
        .filter((thread) => !state.hiddenSubjectThreadIds.has(thread.id))
        .map((thread) => `${thread.id}.dat<>${thread.title} (${thread.posts.length})`)
        .join("\n")}\n`,
    };
    const datMatch = path.match(/^\/local\/dat\/(\d+)\.dat$/u);
    const thread =
      datMatch == null ? undefined : state.threads.find((item) => item.id === datMatch[1]);
    const body = thread == null ? resources[path] : `${thread.posts.join("\n")}\n`;
    if (body === undefined) {
      console.error(`[localboard] 未対応のリクエスト: ${c.req.method} ${c.req.url}`);
      return c.notFound();
    }
    // 毎回200で全体を返し、レスの統合と重複防止を確認する。
    return c.body(Uint8Array.from(iconv.encode(body, "Shift_JIS")).buffer, 200, {
      "Content-Type": `${path.endsWith(".html") ? "text/html" : "text/plain"}; charset=Shift_JIS`,
      "Cache-Control": "no-store",
    });
  });
  return app;
}
