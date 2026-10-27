import { useCallback, useEffect, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  BookmarkContextMenu,
  type BookmarkContextMenuState,
} from "src/features/bookmark/ui/BookmarkContextMenu";
import { container } from "src/service-container/index";
import { type BookmarkEntry, readBookmarks } from "src/view/browser/pages/BookmarkListPage";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";

const logger = createLogger("side-panel-favorites");

export function SidePanelFavorites() {
  const { dispatch } = useTabStore();
  const [entries, setEntries] = useState<BookmarkEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<BookmarkContextMenuState<BookmarkEntry> | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await readBookmarks());
      setError(null);
    } catch (cause) {
      logger.error("お気に入りの読み込みに失敗しました", cause);
      setError("お気に入りを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const updated = () => {
      setMenu(null);
      void load();
    };
    container.message.on("bookmark_updated", updated);
    return () => container.message.off("bookmark_updated", updated);
  }, [load]);
  const open = (entry: BookmarkEntry, background: boolean) => {
    const page = parseInternalBrowserPage(entry.url);
    if (!page) return;
    const target = {
      ...page,
      title: entry.title,
      ...(page.type === "threadList" ? { boardTitle: entry.boardTitle || entry.title } : {}),
    };
    dispatch(
      background ? tabActions.openInNewTab(target, { background }) : tabActions.navigate(target),
    );
  };
  const filtered = entries.filter((entry) =>
    `${entry.title} ${entry.boardTitle}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="side-panel__content">
      <input
        className="side-panel__search"
        type="search"
        aria-label="お気に入りを検索"
        placeholder="お気に入りを検索"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {loading ? (
        <p>お気に入りを読み込み中…</p>
      ) : error ? (
        <div>
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            再試行
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p>お気に入りがありません。</p>
      ) : (
        filtered.map((entry) => (
          <button
            type="button"
            className="side-panel__entry"
            key={entry.url}
            onClick={() => open(entry, false)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                open(entry, true);
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, entry });
            }}
          >
            {entry.title}
            {entry.pageType === "thread" && entry.unreadCount > 0
              ? `（未読 ${entry.unreadCount}）`
              : ""}
          </button>
        ))
      )}
      {menu && (
        <BookmarkContextMenu
          x={menu.x}
          y={menu.y}
          target={{
            kind: menu.entry.pageType === "thread" ? "thread" : "board",
            url: menu.entry.url,
            title: menu.entry.title,
          }}
          onOpenCurrentTab={() => open(menu.entry, false)}
          onOpenInNewTab={(background) => {
            const page = parseInternalBrowserPage(menu.entry.url);
            if (!page) return;
            dispatch(
              tabActions.openInNewTab(
                {
                  ...page,
                  title: menu.entry.title,
                  ...(page.type === "threadList"
                    ? { boardTitle: menu.entry.boardTitle || menu.entry.title }
                    : {}),
                },
                { background },
              ),
            );
          }}
          onRemoved={(url) => setEntries((current) => current.filter((entry) => entry.url !== url))}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
