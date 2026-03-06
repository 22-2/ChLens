import React, { useEffect, useRef, useState } from "react";
import { ThreadNavBar } from "./components/ThreadNavBar";

declare const app: any;
declare const UI: any;

interface ThreadViewProps {
  viewUrl: string;
}

export const ThreadView: React.FC<ThreadViewProps> = ({ viewUrl }) => {
  const viewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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

        // 既存のthread.jsの初期化処理を呼び出し
        // TODO: 段階的に移行

        setIsLoading(false);
      } catch (error) {
        console.error("Thread initialization failed:", error);
        setIsLoading(false);
      }
    };

    initThread();
  }, [viewUrl]);

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
      {isLoading && <div className="loading_overlay">Loading...</div>}
    </div>
  );
};
