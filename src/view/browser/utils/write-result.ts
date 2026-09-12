export type WriteResultMessage =
  | { type: "success"; message?: number | string }
  | { type: "confirm" }
  | { type: "error"; message?: string };

export interface WriteResultPageData {
  url: string;
  title?: string;
  bodyText?: string;
  fontText?: string;
  refreshContent?: string;
}

const WRITE_RESULT_URL_PATTERNS = [
  /^https?:\/\/[^/]+\/test\/bbs\.cgi(?:\?.*)?$/i,
  /^https?:\/\/jbbs\.shitaraba\.net\/bbs\/write\.cgi\/[\w-]+\/[\d-]+\/(?:\d+|new)\/?(?:\?.*)?$/i,
  /^https?:\/\/[^/]+\/bbs\/write\.cgi(?:\?.*)?$/i,
] as const;

const WRITE_SUCCESS_TEXT_PATTERN = /書き(?:こ|込)みました/;
const WRITE_CONFIRM_TEXT_PATTERN = /確認/;
const WRITE_ERROR_TEXT_PATTERN = /(?:ＥＲＲＯＲ|ERROR|スレッド作成規制中)/;

// 変更理由: ブラウザ版はcontent script、Tauri版はHTTPレスポンスを読むため、
// 結果ページの判定だけを共有してプラットフォームごとの通知経路を分ける。
export function isWriteResultPageUrl(rawUrl: string): boolean {
  return WRITE_RESULT_URL_PATTERNS.some((pattern) => pattern.test(rawUrl));
}

export function resolveWriteSuccessDelayMsFromRefresh(
  refreshContent: string | undefined,
): number | undefined {
  if (refreshContent == null) {
    return undefined;
  }

  const matched = refreshContent.match(/^\s*(\d+(?:\.\d+)?)\s*(?:;|$)/);
  if (!matched) {
    return undefined;
  }

  const delayMs = Math.trunc(Number.parseFloat(matched[1]) * 1000);
  return Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : undefined;
}

function resolveErrorMessage(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value !== "" && WRITE_ERROR_TEXT_PATTERN.test(value));
}

export function classifyWriteResult(page: WriteResultPageData): WriteResultMessage | null {
  if (!isWriteResultPageUrl(page.url)) {
    return null;
  }

  const text = [page.title, page.bodyText, page.fontText]
    .filter((value): value is string => value != null && value !== "")
    .join("\n");

  if (WRITE_SUCCESS_TEXT_PATTERN.test(text)) {
    return {
      type: "success",
      message: resolveWriteSuccessDelayMsFromRefresh(page.refreshContent),
    };
  }

  if (WRITE_CONFIRM_TEXT_PATTERN.test(text)) {
    return { type: "confirm" };
  }

  if (WRITE_ERROR_TEXT_PATTERN.test(text)) {
    return {
      type: "error",
      message: resolveErrorMessage(text),
    };
  }

  return null;
}
