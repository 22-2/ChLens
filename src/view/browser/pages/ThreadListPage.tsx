import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTabStore } from "../hooks/use-tab-store";
import { container } from "../../../service-container/index";
import { SearchBar } from "../components/SearchBar";
import type { ThreadListPage as ThreadListPageType } from "../types";
import type { IThread } from "../../../service-container/interfaces";

interface Props {
  page: ThreadListPageType;
}

type SortColumn = "num" | "title" | "resCount";
type SortDirection = "asc" | "desc";

// ハイライトのbgColorに対してコントラストのあるテキスト色を返す
function getContrastTextColor(bgColor: string): string | null {
  const m = bgColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  // YIQ方式で明度を判定
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5 ? "#fff" : null;
}

export const ThreadListPage: React.FC<Props> = ({ page }) => {
  const { dispatch } = useTabStore();
  const [threads, setThreads] = useState<IThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("num");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // container経由でBoardサービスにアクセス
      const result = await container.board.getThreads(page.boardUrl);
      setThreads(result.threads);
      if (result.message) {
        setError(result.message);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "スレッド一覧の取得に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }, [page.boardUrl]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Ctrl+Fで検索バーを開く
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSort = useCallback((column: SortColumn) => {
    setSortColumn((prev) => {
      if (prev === column) {
        // 同じカラムクリック時は方向を反転
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDirection("asc");
      return column;
    });
  }, []);

  // ソート・検索フィルタ適用後のスレッド一覧
  const displayThreads = useMemo(() => {
    let list = threads.map((t, i) => ({ thread: t, originalIndex: i + 1 }));

    // テキスト検索フィルタ
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(({ thread }) =>
        thread.title.toLowerCase().includes(q)
      );
    }

    // ソート
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "num":
          cmp = a.originalIndex - b.originalIndex;
          break;
        case "title":
          cmp = a.thread.title.localeCompare(b.thread.title, "ja");
          break;
        case "resCount":
          cmp = a.thread.resCount - b.thread.resCount;
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    // 既存動作に合わせ、ハイライトスレッドを常に先頭に表示
    const highlighted = list.filter(({ thread }) => thread.highlight);
    const normal = list.filter(({ thread }) => !thread.highlight);
    return [...highlighted, ...normal];
  }, [threads, sortColumn, sortDirection, searchQuery]);

  const handleThreadClick = useCallback(
    (threadUrl: string, threadTitle: string) => {
      dispatch({
        type: "NAVIGATE",
        page: { type: "thread", title: threadTitle, threadUrl },
      });
    },
    [dispatch]
  );

  if (loading) {
    return <div className="page-status">読み込み中...</div>;
  }

  if (error && threads.length === 0) {
    return (
      <div className="page-status page-status--error">
        <p>{error}</p>
        <button className="page-status__retry" onClick={fetchThreads}>
          再試行
        </button>
      </div>
    );
  }

  const sortIndicator = (col: SortColumn) => {
    if (sortColumn !== col) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  return (
    <div className="thread-list-page">
      {showSearch && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={() => {
            setShowSearch(false);
            setSearchQuery("");
          }}
          hitCount={displayThreads.length}
        />
      )}
      {error && <div className="thread-list-page__notice">{error}</div>}
      <table className="thread-list">
        <thead>
          <tr>
            <th
              className="thread-list__th thread-list__th--num"
              onClick={() => handleSort("num")}
            >
              No.{sortIndicator("num")}
            </th>
            <th
              className="thread-list__th thread-list__th--title"
              onClick={() => handleSort("title")}
            >
              タイトル{sortIndicator("title")}
            </th>
            <th
              className="thread-list__th thread-list__th--count"
              onClick={() => handleSort("resCount")}
            >
              レス{sortIndicator("resCount")}
            </th>
          </tr>
        </thead>
        <tbody>
          {displayThreads.map(({ thread, originalIndex }) => {
            const isNG = !!thread.ng;
            const isHighlight = !!thread.highlight;
            const hlParams = thread.highlight?.params;
            const rowStyle: React.CSSProperties = {};
            if (isHighlight && hlParams?.bgColor) {
              rowStyle.backgroundColor = hlParams.bgColor;
              const textColor = getContrastTextColor(hlParams.bgColor);
              if (textColor) rowStyle.color = textColor;
            }

            return (
              <tr
                key={thread.url}
                className={`thread-list__row${isNG ? " thread-list__row--ng" : ""}${isHighlight ? " thread-list__row--highlight" : ""}`}
                style={rowStyle}
                onClick={() => handleThreadClick(thread.url, thread.title)}
              >
                <td className="thread-list__num">{originalIndex}</td>
                <td className="thread-list__title">
                  {thread.title}
                  {isHighlight && hlParams?.label && (
                    <span className="thread-list__label">{hlParams.label}</span>
                  )}
                </td>
                <td className="thread-list__count">{thread.resCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
