import React, { useEffect, useState, useCallback } from "react";
import { useTabStore } from "../hooks/use-tab-store";
import type { ThreadListPage as ThreadListPageType, ThreadListItem } from "../types";

// app_core.js で公開されるBoard API
declare const app: {
  BoardService: {
    getThreads: (url: string) => Promise<{
      threads: ThreadListItem[];
      message?: string;
    }>;
  };
};

interface Props {
  page: ThreadListPageType;
}

export const ThreadListPage: React.FC<Props> = ({ page }) => {
  const { dispatch } = useTabStore();
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await app.BoardService.getThreads(page.boardUrl);
      setThreads(result.threads);
      if (result.message) {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "スレッド一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [page.boardUrl]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const handleThreadClick = useCallback(
    (threadUrl: string, threadTitle: string) => {
      dispatch({
        type: "NAVIGATE",
        page: {
          type: "thread",
          title: threadTitle,
          threadUrl,
        },
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

  return (
    <div className="thread-list-page">
      {error && (
        <div className="thread-list-page__notice">{error}</div>
      )}
      <table className="thread-list">
        <tbody>
          {threads.map((thread, i) => (
            <tr
              key={thread.url}
              className="thread-list__row"
              onClick={() => handleThreadClick(thread.url, thread.title)}
            >
              <td className="thread-list__num">{i + 1}</td>
              <td className="thread-list__title">{thread.title}</td>
              <td className="thread-list__count">{thread.resCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
