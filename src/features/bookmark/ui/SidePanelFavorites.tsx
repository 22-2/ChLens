import { useCallback, useEffect, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  type BookmarkEntry,
  readBookmarks,
  toBookmarkPage,
} from "src/features/bookmark/browser/read-bookmarks";
import {
  BookmarkContextMenu,
  type BookmarkContextMenuState,
} from "src/features/bookmark/ui/BookmarkContextMenu";
import { container } from "src/service-container/index";
import { SidePanelMessage } from "src/view/browser/components/SidePanelMessage";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";

const logger = createLogger("bookmark");

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
    const page = toBookmarkPage(entry);
    if (!page) return;
    dispatch(
      background ? tabActions.openInNewTab(page, { background }) : tabActions.navigate(page),
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
        <SidePanelMessage>お気に入りを読み込み中…</SidePanelMessage>
      ) : error ? (
        <div>
          <SidePanelMessage>{error}</SidePanelMessage>
          <button type="button" onClick={() => void load()}>
            再試行
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <SidePanelMessage>お気に入りがありません。</SidePanelMessage>
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
            const page = toBookmarkPage(menu.entry);
            if (page) dispatch(tabActions.openInNewTab(page, { background }));
          }}
          onRemoved={(url) => setEntries((current) => current.filter((entry) => entry.url !== url))}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
