import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTabStore } from "../hooks/use-tab-store";
import { container } from "../../../service-container/index";
import type { ThreadPage as ThreadPageType } from "../types";
import type { IRes, IThreadDetail } from "../../../service-container/interfaces";

interface Props {
  page: ThreadPageType;
}

export const ThreadPage: React.FC<Props> = ({ page }) => {
  const { dispatch } = useTabStore();
  const [responses, setResponses] = useState<IRes[]>([]);
  const [threadTitle, setThreadTitle] = useState(page.title);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  // タイトル更新済みかを追跡するref
  const titleUpdatedRef = useRef(false);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    titleUpdatedRef.current = false;
    try {
      // container経由でThreadサービスにアクセス
      const result = await container.thread.getThread(page.threadUrl, {
        forceUpdate: false,
        onCache: (cached: IThreadDetail) => {
          // キャッシュデータがあれば先に表示
          if (cached.res) {
            setResponses(cached.res);
          }
          if (cached.title && !titleUpdatedRef.current) {
            setThreadTitle(cached.title);
            dispatch({ type: "UPDATE_TITLE", title: cached.title });
            titleUpdatedRef.current = true;
          }
          setLoading(false);
        },
      });

      setResponses(result.res);
      setExpired(result.expired ?? false);
      if (result.title && !titleUpdatedRef.current) {
        setThreadTitle(result.title);
        dispatch({ type: "UPDATE_TITLE", title: result.title });
      }
      if (result.message) {
        setError(result.message);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "スレッドの取得に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }, [page.threadUrl, dispatch]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  if (loading && responses.length === 0) {
    return <div className="page-status">読み込み中...</div>;
  }

  if (error && responses.length === 0) {
    return (
      <div className="page-status page-status--error">
        <p>{error}</p>
        <button className="page-status__retry" onClick={fetchThread}>
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="thread-page">
      {expired && (
        <div className="thread-page__notice">このスレッドはdat落ちしています</div>
      )}
      {error && (
        <div className="thread-page__notice">{error}</div>
      )}
      <div className="thread-page__responses">
        {responses.map((res) => (
          <ResItem key={res.num} res={res} />
        ))}
      </div>
    </div>
  );
};

// --- 個別レス表示 ---

const ResItem: React.FC<{ res: IRes }> = React.memo(({ res }) => {
  return (
    <article className="res">
      <header className="res__header">
        <span className="res__num">{res.num}</span>
        <span
          className="res__name"
          dangerouslySetInnerHTML={{ __html: res.name }}
        />
        {res.id && <span className="res__id">{res.id}</span>}
        <span className="res__date">{res.date ?? res.other}</span>
      </header>
      <div
        className="res__body"
        dangerouslySetInnerHTML={{ __html: res.message }}
      />
    </article>
  );
});
ResItem.displayName = "ResItem";
