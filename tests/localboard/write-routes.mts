import { Hono } from "hono";
import iconv from "iconv-lite";

import {
  createEdgeAuthPage,
  EDGE_AUTH_TOKEN,
} from "../../src/features/write/fixtures/edge-auth-page.ts";

interface WriteContext {
  enabled: () => boolean;
  attempts: { mail: string; message: string }[];
  append: (message: string) => void;
}

/** 通常のURLSearchParamsはUTF-8前提なので、投稿フォームは元のバイトをShift_JISで解釈する。 */
function readField(encoded: string, name: string): string {
  const value =
    encoded
      .split("&")
      .find((entry) => entry.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? "";
  const bytes = Buffer.from(
    value
      .replace(/\+/g, " ")
      .replace(/%([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16))),
    "latin1",
  );
  return iconv.decode(bytes, "Shift_JIS");
}

export function createWriteRoutes(state: WriteContext) {
  const app = new Hono();
  app.get("/auth-code", (c) => (state.enabled() ? c.html(createEdgeAuthPage()) : c.notFound()));
  app.post("/test/bbs.cgi", async (c) => {
    if (!state.enabled()) return c.notFound();
    const encoded = await c.req.text();
    const mail = readField(encoded, "mail");
    const message = readField(encoded, "MESSAGE");
    state.attempts.push({ mail, message });
    const success = mail === EDGE_AUTH_TOKEN;
    if (success) state.append(message);
    const host = c.req.header("host") ?? "127.0.0.1";
    const html = success
      ? "<html><head><title>書きこみました</title></head><body>書きこみました</body></html>"
      : `<html><head><title>ＥＲＲＯＲ</title><meta name="error_code" content="E-Unauthenticated"></head><body>認証コード'123456'を用いて、以下のURLから認証を行ってください https://${host}/auth-code</body></html>`;
    return c.body(Uint8Array.from(iconv.encode(html, "Shift_JIS")).buffer, 200, {
      "Content-Type": "text/html; charset=Shift_JIS",
      "Cache-Control": "no-store",
    });
  });
  return app;
}
