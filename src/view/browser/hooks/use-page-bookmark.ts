import { useCallback, useEffect, useMemo, useState } from "react";
import { container } from "src/service-container/index";
import type { Page } from "src/view/browser/types";
import { waitForLegacyBookmarkReady } from "src/view/browser/utils/legacy-app";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";

export interface BookmarkTarget {
  url: string;
  title: string;
  type: "thread" | "board";
}

interface BookmarkUpdatePayload {
  bookmark?: {
    url?: unknown;
  };
}

function normalizeBookmarkTitle(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function deriveBookmarkTarget(page: Page): BookmarkTarget | null {
  switch (page.type) {
    case "thread":
      return {
        url: page.threadUrl,
        title: normalizeBookmarkTitle(page.title, page.threadUrl),
        type: "thread",
      };

    case "threadList":
      return {
        url: page.boardUrl,
        title: normalizeBookmarkTitle(page.boardTitle || page.title, page.boardUrl),
        type: "board",
      };

    default:
      return null;
  }
}

function normalizeBookmarkComparableUrl(url: string): string {
  const parsed = parseInternalBrowserPage(url);
  if (parsed) {
    return parsed.type === "thread" ? parsed.threadUrl : parsed.boardUrl;
  }

  try {
    return new window.URL(url).href;
  } catch {
    return url.trim();
  }
}

function readBookmarkStatus(url: string): boolean {
  try {
    return Boolean(container.bookmark.get(url));
  } catch {
    // 起動中は bookmark service が未接続のことがあるため、UIを壊さず未登録として描画する。
    return false;
  }
}

export interface PageBookmarkState {
  bookmarkTarget: BookmarkTarget | null;
  isBookmarked: boolean;
  isBookmarkPending: boolean;
  toggleBookmark: () => void;
}

export function usePageBookmark(page: Page): PageBookmarkState {
  const bookmarkTarget = useMemo(() => deriveBookmarkTarget(page), [page]);
  const normalizedBookmarkTargetUrl = useMemo(
    () => (bookmarkTarget ? normalizeBookmarkComparableUrl(bookmarkTarget.url) : null),
    [bookmarkTarget],
  );
  const [isBookmarked, setIsBookmarked] = useState<boolean>(() =>
    bookmarkTarget ? readBookmarkStatus(bookmarkTarget.url) : false,
  );
  const [isBookmarkPending, setIsBookmarkPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setIsBookmarkPending(false);
    setIsBookmarked(bookmarkTarget ? readBookmarkStatus(bookmarkTarget.url) : false);

    if (!bookmarkTarget) {
      return;
    }

    void waitForLegacyBookmarkReady().then(() => {
      if (cancelled) {
        return;
      }

      // 変更理由: 既存ブックマークの初回 scan より先に描画されると星が未登録のまま固まるため、
      // ready 後に source of truth を再読込して見た目を揃える。
      setIsBookmarked(readBookmarkStatus(bookmarkTarget.url));
    });

    return () => {
      cancelled = true;
    };
  }, [bookmarkTarget]);

  useEffect(() => {
    if (!bookmarkTarget) {
      return;
    }

    const handleBookmarkUpdated = ({ bookmark }: BookmarkUpdatePayload = {}) => {
      if (
        typeof bookmark?.url === "string" &&
        normalizeBookmarkComparableUrl(bookmark.url) !== normalizedBookmarkTargetUrl
      ) {
        return;
      }

      // 変更理由: 現在ページの星は他UIからの追加・削除にも追従しないと、
      // タブバー・メニュー・URLバーの表示が食い違うため、更新通知を共通の状態源へ反映する。
      setIsBookmarked(readBookmarkStatus(bookmarkTarget.url));
      setIsBookmarkPending(false);
    };

    try {
      container.message.on("bookmark_updated", handleBookmarkUpdated);
      return () => {
        container.message.off("bookmark_updated", handleBookmarkUpdated);
      };
    } catch {
      return;
    }
  }, [bookmarkTarget, normalizedBookmarkTargetUrl]);

  const toggleBookmark = useCallback(() => {
    if (!bookmarkTarget || isBookmarkPending) {
      return;
    }

    const currentBookmarkedState = readBookmarkStatus(bookmarkTarget.url);
    const nextBookmarkedState = !currentBookmarkedState;

    // 変更理由: 永続化イベントを待つだけだとクリック直後に無反応に見えるため、
    // source of truth から次状態を決めて optimistic に反映し、連打時の add/remove 逆転も防ぐ。
    setIsBookmarkPending(true);
    setIsBookmarked(nextBookmarkedState);

    void Promise.resolve()
      .then(() => {
        if (currentBookmarkedState) {
          return container.bookmark.remove(bookmarkTarget.url);
        }

        return container.bookmark.add({
          url: bookmarkTarget.url,
          title: bookmarkTarget.title,
          type: bookmarkTarget.type,
        });
      })
      .then(() => {
        const actualBookmarkedState = readBookmarkStatus(bookmarkTarget.url);

        // 変更理由: add/remove 完了と get()/message 反映が非同期に前後しうるため、
        // この時点で未反映でも失敗扱いにせず optimistic state を維持し、後続通知で揃える。
        if (actualBookmarkedState === nextBookmarkedState) {
          setIsBookmarked(actualBookmarkedState);
        }

        container.toast.info(
          nextBookmarkedState ? "ブックマークに追加しました" : "ブックマークを削除しました",
        );
      })
      .catch((error: unknown) => {
        setIsBookmarked(readBookmarkStatus(bookmarkTarget.url));
        setIsBookmarkPending(false);
        container.toast.error(
          nextBookmarkedState
            ? "ブックマークの追加に失敗しました"
            : "ブックマークの削除に失敗しました",
        );
        console.error("Bookmark operation failed", error);
      })
      .finally(() => {
        setIsBookmarkPending(false);
      });
  }, [bookmarkTarget, isBookmarkPending]);

  return {
    bookmarkTarget,
    isBookmarked,
    isBookmarkPending,
    toggleBookmark,
  };
}
