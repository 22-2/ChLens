import React, { useEffect, useRef, useState } from "react";
import { ThreadNavBar } from "src/view/thread/components/ThreadNavBar";
import { useApp } from "src/view/thread/context/AppContext";

interface ReloadRequestDetail {
  force_update?: boolean;
}

interface ThreadResponse {
  title: string;
  message?: string;
  res: unknown[];
}

interface ThreadContentLike {
  addItem(items: unknown[], title: string): Promise<void>;
}

interface ThreadContainerLike {
  getThread(
    url: string,
    options: {
      forceUpdate: boolean;
      onCache: (cachedThread: ThreadResponse) => void;
    },
  ): Promise<ThreadResponse>;
}

interface ThreadViewProps {
  viewUrl: string;
}

export const ThreadView: React.FC<ThreadViewProps> = ({ viewUrl }) => {
  const { app, UI, isReady } = useApp();
  const viewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const threadContentRef = useRef<ThreadContentLike | null>(null);
  const loadingRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !viewUrl) return;

    const loadThread = async ({ forceUpdate = false } = {}) => {
      if (!viewRef.current || !contentRef.current || !threadContentRef.current) {
        return;
      }
      if (loadingRef.current) {
        return;
      }

      const $view = viewRef.current;
      const $content = contentRef.current;
      const threadContent = threadContentRef.current;
      const reloadButton = $view.querySelector<HTMLButtonElement>(
        ".button_reload",
      );

      let cacheApplied = Promise.resolve();
      loadingRef.current = true;
      $view.classList.add("loading");
      if (reloadButton) {
        reloadButton.classList.add("disabled");
      }

      const applyThread = async (thread: ThreadResponse) => {
        if (!thread.res) {
          throw new Error("スレの取得に失敗しました");
        }
        if (thread.title) {
          document.title = thread.title;
        }

        const renderedCount = $content.children.length;
        const newItems = thread.res.slice(renderedCount);
        if (newItems.length > 0) {
          await threadContent.addItem(newItems, thread.title);
        }
      };

      try {
        // 更新時に既存DOMを保持して差分だけ描画することで、フルリロードによるスクロール位置リセットを防ぐ。
        const container = (
          window as unknown as { container?: { thread?: ThreadContainerLike } }
        ).container?.thread;
        if (!container) {
          throw new Error("thread container is not available");
        }

        const thread = await container.getThread(viewUrl, {
          forceUpdate,
          onCache: (cachedThread) => {
            cacheApplied = applyThread(cachedThread);
          },
        });

        await cacheApplied;
        await applyThread(thread);
      } finally {
        loadingRef.current = false;
        $view.classList.remove("loading");
        if (reloadButton) {
          reloadButton.classList.remove("disabled");
        }
      }
    };

    const initThread = async () => {
      if (!viewRef.current || !contentRef.current) return;

      const $view = viewRef.current;
      const $content = contentRef.current;

      $view.dataset.url = viewUrl;

      try {
        const url = new app.URL.URL(viewUrl);
        const threadContent = await UI.ThreadContent.init(url, $content);
        threadContentRef.current = threadContent;

        app.DOMData.set($view, "threadContent", threadContent);
        app.DOMData.set($view, "selectableItemList", threadContent);
        new app.view.TabContentView($view);

        const onRequestReload = (event: Event) => {
          const detail = (event as CustomEvent<ReloadRequestDetail>).detail;
          void loadThread({ forceUpdate: detail?.force_update === true });
        };

        $view.addEventListener("request_reload", onRequestReload);
        await loadThread({ forceUpdate: false });

        setIsLoading(false);

        return () => {
          $view.removeEventListener("request_reload", onRequestReload);
        };
      } catch (err) {
        console.error("Thread initialization failed:", err);
        setError(err instanceof Error ? err.message : "初期化に失敗しました");
        setIsLoading(false);
        return () => {};
      }
    };

    let dispose: (() => void) | undefined;
    void (async () => {
      dispose = await initThread();
    })();

    return () => {
      if (dispose) {
        dispose();
      }
    };
  }, [isReady, viewUrl, app, UI]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">
          アプリケーションを初期化中...
        </div>
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
