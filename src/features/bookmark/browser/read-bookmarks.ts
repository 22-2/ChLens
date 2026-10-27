import { container } from "src/service-container/index";
import {
  parseInternalBrowserPage,
  resolveBoardUrlForBrowser,
} from "src/view/browser/utils/link-routing";

export interface BookmarkEntry {
  url: string;
  title: string;
  pageType: "thread" | "threadList";
  boardTitle: string;
  resCount: number;
  unreadCount: number;
  heat: number;
  createdAt: number;
  originalIndex: number;
}

interface LegacyReadStateLike {
  read?: unknown;
}

interface LegacyBookmarkLike {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
  resCount?: unknown;
  readState?: LegacyReadStateLike | undefined;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseCreatedAt(url: string): number {
  const resolved = resolveBoardUrlForBrowser(url);
  if (resolved?.type !== "thread" || !/^\d+$/.test(resolved.threadId)) return 0;
  return Number.parseInt(resolved.threadId, 10) * 1000;
}

function calcHeat(createdAt: number, resCount: number): number {
  if (!createdAt || createdAt > Date.now()) {
    return 0;
  }
  const elapsedDays = Math.max((Date.now() - createdAt) / 86400000, 1 / 1440);
  return resCount / elapsedDays;
}

function deriveBoardTitle(threadUrl: string): string {
  try {
    const parsed = new window.URL(threadUrl);
    // 変更理由: 掲示板別のURL形式から板名を再抽出せず、ライブラリが返す板識別子を表示する。
    const resolved = resolveBoardUrlForBrowser(threadUrl);
    if (resolved?.type === "thread") {
      return `${parsed.hostname}/${resolved.boardName}`;
    }

    return parsed.hostname;
  } catch {
    return "";
  }
}

function deriveBoardTitleFromBoardUrl(boardUrl: string): string {
  try {
    const parsed = new window.URL(boardUrl);
    const pathPart = parsed.pathname.replace(/^\/|\/$/g, "");
    return pathPart ? `${parsed.hostname}/${pathPart}` : parsed.hostname;
  } catch {
    return "";
  }
}

export async function readBookmarks(): Promise<BookmarkEntry[]> {
  // window.app ではなくサービスコンテナから読む（legacy-window-app-plan の Phase 2）。
  // 以前は getAll がない場合に getAllThreads・getAllBoards をつなげていたが、Bookmark は常に getAll を持つ。
  await container.bookmark.ready();
  // 保存されている値の形は信用せず、下で1件ずつ確かめるため unknown として扱う。
  const rawItems: unknown[] = container.bookmark.getAll();

  return rawItems
    .map((rawItem, index) => {
      const item = rawItem as LegacyBookmarkLike;
      const url = normalizeString(item.url);
      if (!url) {
        return null;
      }

      const parsed = parseInternalBrowserPage(url);
      if (!parsed) {
        return null;
      }

      const title = normalizeString(item.title, url);
      const resCount = Math.max(0, Math.trunc(toNumber(item.resCount)));
      const readCount = Math.max(0, Math.trunc(toNumber(item.readState?.read)));
      const isThreadBookmark = parsed.type === "thread";
      const unreadCount = isThreadBookmark ? Math.max(0, resCount - readCount) : 0;
      const createdAt = isThreadBookmark ? parseCreatedAt(url) : 0;

      return {
        url,
        title,
        pageType: parsed.type,
        boardTitle:
          parsed.type === "threadList"
            ? normalizeString(item.boardTitle, deriveBoardTitleFromBoardUrl(url))
            : normalizeString(item.boardTitle, deriveBoardTitle(url)),
        resCount,
        unreadCount,
        heat: isThreadBookmark ? calcHeat(createdAt, resCount) : 0,
        createdAt,
        originalIndex: index,
      } satisfies BookmarkEntry;
    })
    .filter((item): item is BookmarkEntry => item !== null);
}
