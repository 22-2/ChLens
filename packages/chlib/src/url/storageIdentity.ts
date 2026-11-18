import { ChURL } from "./ChURL";
import { HOSTNAME } from "./hosts";
import { PATTERNS } from "./patterns";

/**
 * 同じスレを指すURL表記の候補を返す。
 *
 * 変更理由: スレログと閲覧履歴は、開いた経路によってプロトコル・ホスト別名・
 * クエリ・hash・レス番号付きパスの有無が異なる。削除時は保存側の表記と
 * 完全一致しないことがあり、ログや履歴が残る原因になっていた。
 */
export function getThreadUrlAliases(rawUrl: string): string[] {
  const aliases = new Set<string>([rawUrl]);

  let canonical: URL;
  try {
    canonical = new URL(new ChURL(rawUrl).href);
  } catch {
    // 解釈できない値は呼び出し元の原文だけで照合する。
    return [...aliases];
  }

  aliases.add(canonical.href);
  const withoutHash = new URL(canonical.href);
  withoutHash.hash = "";
  aliases.add(withoutHash.href);
  const withoutQuery = new URL(withoutHash.href);
  withoutQuery.search = "";
  aliases.add(withoutQuery.href);

  // ブックマークや貼り付けたURLでは同じスレがhttp/httpsの両方で保存されうる。
  for (const base of [withoutHash, withoutQuery]) {
    for (const protocol of ["http:", "https:"]) {
      const variant = new URL(base.href);
      variant.protocol = protocol;
      aliases.add(variant.href);
    }
  }

  return [...aliases];
}

/**
 * スレログ・閲覧履歴の照合に使う、プロトコル・クエリ・hashに依存しないキー。
 *
 * 5chはサーバー移転でサブドメインが変わるため、既読状態と同じく共通ホストへ畳む。
 * サーバーが変わっても同じ板・スレIDなら同じスレとして扱う。
 */
export function getThreadRecordKey(rawUrl: string): string | null {
  try {
    const parsed = new ChURL(rawUrl);
    if (parsed.type !== "thread") return null;
    const url = parsed.url;
    const hostname = url.hostname.toLowerCase();
    const recordHost = hostname.endsWith(`.${HOSTNAME.NEW_5CH}`)
      ? `*.${HOSTNAME.NEW_5CH}`
      : hostname;
    return `${recordHost}${url.pathname}`;
  } catch {
    return null;
  }
}

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
