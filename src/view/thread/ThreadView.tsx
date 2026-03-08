import React, { useEffect, useRef, useState } from "react";
import { ThreadNavBar } from "./components/ThreadNavBar";
import { useApp } from "./context/AppContext";

interface ThreadViewProps {
  viewUrl: string;
}

export const ThreadView: React.FC<ThreadViewProps> = ({ viewUrl }) => {
  const { app, UI, isReady } = useApp();
  const viewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !viewUrl) return;

    const initThread = async () => {
      if (!viewRef.current || !contentRef.current) return;

      const $view = viewRef.current;
      const $content = contentRef.current;

      $view.dataset.url = viewUrl;

      try {
        // 既存のThreadContent初期化ロジックを使用
        const url = new app.URL.URL(viewUrl);
        const threadContent = await UI.ThreadContent.init(url, $content);

        app.DOMData.set($view, "threadContent", threadContent);
        app.DOMData.set($view, "selectableItemList", threadContent);

        setIsLoading(false);
      } catch (err) {
        console.error("Thread initialization failed:", err);
        setError(err instanceof Error ? err.message : "初期化に失敗しました");
        setIsLoading(false);
      }
    };

    initThread();
  }, [isReady, viewUrl, app, UI]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">アプリケーションを初期化中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-destructive">エラー: {error}</div>
      </div>
    );
  }

  return (
    <div ref={viewRef} className="view view_thread" data-url={viewUrl}>
      <div className="message_bar" />
      <ThreadNavBar />
      <div ref={contentRef} className="content" tabIndex={0} />
      <div className="popup_area" />
      <footer className="thread_footer">
        <div className="loading_indicator hidden">読み込み中</div>
        <a className="next_unread open_in_rcrx hidden" />
        <button className="search_next_thread hidden">次スレ検索</button>
      </footer>
      {isLoading && (
        <div className="loading_overlay flex items-center justify-center">
          <div className="text-lg">Loading...</div>
        </div>
      )}
    </div>
  );
};
