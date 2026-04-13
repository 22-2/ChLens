import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import { ask as askBoardTitle } from "src/core/BoardTitleSolver.js";
import { URL as ChURL } from "src/core/URL";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { ThreadListPage as ThreadListPageType } from "src/view/browser/types";

interface Props {
  page: ThreadListPageType;
}

type SortColumn = "num" | "title" | "resCount" | "heat";
type SortDirection = "asc" | "desc";

const BG_COLOR_PRESETS: Record<string, string> = {
  yellow: "#ffeb3b",
  blue: "#e3f2fd",
  green: "#c8e6c9",
  red: "#ffcdd2",
  purple: "#e1bee7",
  orange: "#ffe0b2",
  pink: "#f8bbd0",
  cyan: "#b2ebf2",
  lime: "#f0f4c3",
  amber: "#ffecb3",
};

// 既存実装と同じ方式で、背景色に対する可読色（#222/#eee）を返す
function getContrastTextColor(bgColor: string): string | null {
  try {
    if (!/^#[0-9a-f]{6}$/i.test(bgColor)) return null;
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const lin = (c: number) => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return lum > 0.179 ? "#222" : "#eee";
  } catch {
    return null;
  }
}

function calcHeat(now: number, created: number, resCount: number): string {
  if (!Number.isFinite(created) || created > now) return "0.0";
  const elapsed = Math.max((now - created) / 1000, 1) / (24 * 60 * 60);
  return (resCount / elapsed).toFixed(1);
}

export const ThreadListPage: React.FC<Props> = ({ page }) => {
  const { dispatch } = useTabStore();
  const titleFetched = useRef(false);
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
        e instanceof Error ? e.message : "スレッド一覧の取得に失敗しました",
      );
    } finally {
      setLoading(false);
    }
  }, [page.boardUrl]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (titleFetched.current) return;
    titleFetched.current = true;
    // boardTitleがURLと同じ場合（アドレスバー入力など）はBoardTitleSolverで解決する
    if (page.boardTitle && page.boardTitle !== page.boardUrl) {
      dispatch({ type: "UPDATE_TITLE", title: page.boardTitle });
      return;
    }
    askBoardTitle(new ChURL(page.boardUrl)).then((title) => {
      if (title) dispatch({ type: "UPDATE_TITLE", title });
    }).catch((err) => {
      console.error(err);
    });
  }, [dispatch, page.boardTitle, page.boardUrl]);

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
    const now = Date.now();
    let list = threads.map((t, i) => ({
      thread: t,
      originalIndex: i + 1,
      heat: parseFloat(calcHeat(now, t.createdAt, t.resCount)),
    }));

    // テキスト検索フィルタ
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(({ thread }) =>
        thread.title.toLowerCase().includes(q),
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
        case "heat":
          cmp = a.heat - b.heat;
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
    [dispatch],
  );

  const openThreadInNewTab = useCallback(
    (threadUrl: string, threadTitle: string) => {
      // 先にタブを追加してからNAVIGATEすることで、新規タブ側に遷移させる
      dispatch({ type: "ADD_TAB" });
      dispatch({
        type: "NAVIGATE",
        page: { type: "thread", title: threadTitle, threadUrl },
      });
    },
    [dispatch],
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
            <th
              className="thread-list__th thread-list__th--heat"
              onClick={() => handleSort("heat")}
            >
              勢い{sortIndicator("heat")}
            </th>
          </tr>
        </thead>
        <tbody>
          {displayThreads.map(({ thread, originalIndex, heat }) => {
            const isNG = !!thread.ng;
            const isHighlight = !!thread.highlight;
            const hlParams = thread.highlight?.params;
            const rowStyle: React.CSSProperties = {};
            if (isHighlight && hlParams?.bgColor) {
              const bgColor =
                BG_COLOR_PRESETS[hlParams.bgColor] ?? hlParams.bgColor;
              rowStyle.backgroundColor = bgColor;
              const textColor = getContrastTextColor(bgColor);
              if (textColor) rowStyle.color = textColor;
            }
            return (
              <tr
                key={thread.url}
                className={`thread-list__row${isNG ? " thread-list__row--ng" : ""}${isHighlight ? " thread-list__row--highlight" : ""}`}
                style={rowStyle}
                onClick={() => handleThreadClick(thread.url, thread.title)}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    openThreadInNewTab(thread.url, thread.title);
                  }
                }}
              >
                <td className="thread-list__num">{originalIndex}</td>
                <td className="thread-list__title">
                  {thread.title}
                  {isHighlight && hlParams?.label && (
                    <span className="thread-list__label">{hlParams.label}</span>
                  )}
                </td>
                <td className="thread-list__count">{thread.resCount}</td>
                <td className="thread-list__heat">{heat.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
