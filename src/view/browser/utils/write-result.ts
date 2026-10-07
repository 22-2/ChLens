import {
  isWriteResultPageUrl as isChLibWriteResultPageUrl,
  resolveWriteAuthCodeUrl as resolveChLibWriteAuthCodeUrl,
} from "packages/chlib/src/index";
import type { WriteConfirmationPage } from "src/view/browser/utils/write-confirmation";

export type WriteResultMessage =
  | { type: "success"; message?: number | string }
  | { type: "confirm"; page?: WriteConfirmationPage }
  | { type: "auth-code"; code: string; url: string }
  | { type: "error"; message?: string };

export interface WriteResultPageData {
  url: string;
  title?: string;
  bodyText?: string;
  fontText?: string;
  refreshContent?: string;
  errorCode?: string;
}

const WRITE_SUCCESS_TEXT_PATTERN = /書き(?:こ|込)みました/;
const WRITE_CONFIRM_TEXT_PATTERN = /確認/;
const WRITE_AUTH_CODE_PATTERN = /認証コード\s*['’‘＇]?([0-9]{6})['’”＇]?/;
const WRITE_ERROR_TEXT_PATTERN =
  /(?:ＥＲＲＯＲ|ERROR|書き込みエラー|書込みエラー|投稿エラー|スレッド作成規制中)/;

// 変更理由: ブラウザ版はcontent script、Tauri版はHTTPレスポンスを読むため、
// 結果ページの判定だけを共有してプラットフォームごとの通知経路を分ける。
export function isWriteResultPageUrl(rawUrl: string): boolean {
  return isChLibWriteResultPageUrl(rawUrl);
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

function resolveErrorMessage(page: WriteResultPageData): string | undefined {
  // タイトルだけの「ＥＲＲＯＲ」を優先すると拒否理由が消えるため、本文と強調文から詳細を探す。
  let fallback: string | undefined;
  for (const text of [page.fontText, page.bodyText, page.title]) {
    const lines = (text ?? "")
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value !== "");
    fallback ??= lines[0];
    const details = lines.filter(
      (value) =>
        !/^(?:ＥＲＲＯＲ|ERROR|エラー|書き込みエラー|書込みエラー|投稿エラー)[\s:：!！]*$/i.test(
          value,
        ),
    );
    if (details.length > 0) {
      return [...new Set(details)].join("\n");
    }
  }
  return fallback;
}

export function classifyWriteResult(page: WriteResultPageData): WriteResultMessage | null {
  if (!isWriteResultPageUrl(page.url)) {
    return null;
  }

  const text = [page.title, page.bodyText, page.fontText]
    .filter((value): value is string => value != null && value !== "")
    .join("\n");

  const authCode = text.match(WRITE_AUTH_CODE_PATTERN)?.[1];
  if (authCode != null && page.errorCode === "E-Unauthenticated") {
    // 変更理由: 書き込みフォームのURL形式と安全な認証先判定は掲示板仕様としてchlibへ委譲する。
    const authCodeUrl = resolveChLibWriteAuthCodeUrl(text, page.url);
    if (authCodeUrl != null) {
      return { type: "auth-code", code: authCode, url: authCodeUrl };
    }
  }

  if (WRITE_SUCCESS_TEXT_PATTERN.test(text)) {
    return {
      type: "success",
      message: resolveWriteSuccessDelayMsFromRefresh(page.refreshContent),
    };
  }

  // エラー本文にも「確認してください」が含まれるので、確認ページより拒否結果を優先する。
  if (page.errorCode || WRITE_ERROR_TEXT_PATTERN.test(text)) {
    return {
      type: "error",
      message: resolveErrorMessage(page),
    };
  }

  if (WRITE_CONFIRM_TEXT_PATTERN.test(text)) {
    return { type: "confirm" };
  }

  return null;
}
