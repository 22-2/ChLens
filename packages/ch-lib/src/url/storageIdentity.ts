import { ChURL } from "./ChURL";
import { HOSTNAME } from "./hosts";
import { PATTERNS } from "./patterns";

/** 既読DB用にURLを正規化し、5ch各サーバーを共通hostキーへまとめる。 */
export function normalizeReadStateUrl(rawUrl: string): string {
  try {
    const url = new ChURL(rawUrl).url;
    // 既読状態はスレッド本文の識別子であり、表示位置用のhashは保存キーに含めない。
    url.hash = "";
    if (url.hostname.endsWith(`.${HOSTNAME.NEW_5CH}`)) url.hostname = `*.${HOSTNAME.NEW_5CH}`;
    return url.href;
  } catch {
    // 既読データの移行中に壊れた値を捨てないよう、解釈できない値は原文で保持する。
    return rawUrl;
  }
}

/** BoardServiceの既読照合に使う板URL。既存DBのeddibbキー形式を維持する。 */
export function getReadStateBoardUrl(rawUrl: string): string {
  let parsed: ChURL;
  try {
    parsed = new ChURL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (parsed.url.hostname !== HOSTNAME.EDDIBB) return rawUrl;

  const match = /^\/(?:test\/read\.cgi\/)?([\w-]+)\/?$/i.exec(parsed.url.pathname);
  if (!match) return rawUrl;

  parsed.url.protocol = "http:";
  parsed.url.pathname = `/${match[1]}/`;
  return parsed.url.href;
}

/** BoardServiceの既読照合に使うスレッドURL。eddibbだけhttp正規URLへ揃える。 */
export function getReadStateThreadUrl(rawUrl: string): string {
  try {
    const parsed = new ChURL(rawUrl);
    return parsed.url.hostname === HOSTNAME.EDDIBB ? parsed.url.href : rawUrl;
  } catch {
    return rawUrl;
  }
}

/** したらばの過去ログ移動エラーに表示するread_archive URLを生成する。 */
export function toArchiveThreadUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.pathname.includes("read_archive.cgi")) return null;
    if (!PATTERNS.SHITARABA_THREAD.test(url.pathname)) return null;
    url.pathname = url.pathname.replace("/read.cgi/", "/read_archive.cgi/");
    return url.href;
  } catch {
    return null;
  }
}
