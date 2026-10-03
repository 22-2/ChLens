import {
  getBoardUrlFromThreadUrl as getChLibBoardUrlFromThreadUrl,
  resolveBoardUrl as resolveChLibBoardUrl,
} from "packages/ch-lib/src/index";
import type { MouseEvent } from "react";
import { resolveItestServerHostname } from "src/view/browser/utils/itest-server-map";

export type UrlHandlingMode = "respect-default-external";
export const RESPECT_DEFAULT_EXTERNAL: UrlHandlingMode = "respect-default-external";

export type ResBodyUrlClickHandler = (
  url: string,
  button: 0 | 1,
  mode?: UrlHandlingMode,
) => boolean | void;

export type UrlClickHandler = (
  url: string,
  resImages?: string[],
  button?: 0 | 1,
  mode?: UrlHandlingMode,
) => boolean | void;

export type UrlContextMenuHandler = (
  url: string,
  e: MouseEvent,
  mode?: UrlHandlingMode,
) => boolean | void;

export interface InternalThreadPage {
  type: "thread";
  title: string;
  threadUrl: string;
}

export interface InternalThreadListPage {
  type: "threadList";
  title: string;
  boardUrl: string;
  boardTitle: string;
}

export type InternalBrowserPage = InternalThreadPage | InternalThreadListPage;

/** 相対URLを現在ページに対して解決する、掲示板形式に依存しない補助関数。 */
export function resolveAbsoluteUrl(rawUrl: string, baseUrl: string): string {
  try {
    return new window.URL(rawUrl, baseUrl).href;
  } catch {
    return rawUrl;
  }
}

function toInternalBrowserPage(
  result: ReturnType<typeof resolveChLibBoardUrl>,
): InternalBrowserPage | null {
  if (!result) return null;

  if (result.type === "thread") {
    return { type: "thread", title: result.url, threadUrl: result.threadUrl };
  }

  return {
    type: "threadList",
    title: result.url,
    boardUrl: result.boardUrl,
    boardTitle: result.boardUrl,
  };
}

export function resolveBoardUrlForBrowser(
  absoluteUrl: string,
  mode: "strict" | "browse" | "guess" = "browse",
) {
  // 変更理由: 掲示板ごとのホスト・URL形式・正規化規則を画面側へ複製せず、
  // 入力経路ごとの許容方針だけを指定して ch-lib の意味単位APIへ渡す。
  return resolveChLibBoardUrl(absoluteUrl, {
    mode,
    resolveServerHostname: resolveItestServerHostname,
  });
}

function resolvePage(absoluteUrl: string, mode: "strict" | "browse" | "guess") {
  return toInternalBrowserPage(resolveBoardUrlForBrowser(absoluteUrl, mode));
}

export function getBoardUrlFromThreadUrl(threadUrl: string): string {
  // 変更理由: 既存の入力スキームを保ちつつ、必要なサーバー対応表も注入して板URL生成をch-libに委譲する。
  return getChLibBoardUrlFromThreadUrl(threadUrl, {
    resolveServerHostname: resolveItestServerHostname,
  });
}

/** 内部ブラウズとオムニバーで使う、互換形式を含むページ解決。 */
export function parseInternalBrowserPage(absoluteUrl: string): InternalBrowserPage | null {
  return resolvePage(absoluteUrl, "browse");
}

/** クリック経路では掲示板として確実に識別できるURLだけを解決する。 */
export function parseInternalBrowserPageStrict(absoluteUrl: string): InternalBrowserPage | null {
  return resolvePage(absoluteUrl, "strict");
}

/** オムニバーでは未知ホストの短縮スレURLも推測して解決する。 */
export function parseOmnibarBrowserPage(absoluteUrl: string): InternalBrowserPage | null {
  return resolvePage(absoluteUrl, "guess");
}

export function shouldHandleUrlWithApp(absoluteUrl: string, mode?: UrlHandlingMode): boolean {
  if (mode !== RESPECT_DEFAULT_EXTERNAL) return true;
  return parseInternalBrowserPage(absoluteUrl) != null;
}
