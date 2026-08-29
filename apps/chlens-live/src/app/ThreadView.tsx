import type { IRes, ThreadData } from "@chlen/ch-lib";
import { Copy, RotateCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from "react";
import type { IRes as BrowserResponse } from "src/service-container/interfaces";
import { ContextMenu, type ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { copyText } from "src/view/browser/utils/clipboard";
import { formatResForCopy } from "src/view/browser/utils/response-format";
import { LiveResponse } from "./LiveResponse";

const AUTO_REFRESH_BOUNDARY_PX = 120;

interface ResponseContextMenuState {
  x: number;
  y: number;
  response: BrowserResponse;
  selectedText: string;
}

export interface ThreadViewProps {
  posts: IRes[];
  error: unknown;
  onRefresh: () => void;
  threadUrl?: string;
  autoRefreshEnabled?: boolean;
  pollingEnabled?: boolean;
  onPollingEnabledChange?: (enabled: boolean) => void;
}

function getScrollContainer(root: HTMLDivElement | null): HTMLElement | null {
  const panel = root?.closest(".content-area__tab-panel");
  return panel instanceof HTMLElement ? panel : null;
}

/**
 * スレ本文（datのレス列）を表示するThread UI。
 *
 * レス自体はChLensのResItemへ渡し、Live側では取得状態・自動更新の境界・メニューだけを
 * 組み合わせる。これにより本文のHTML化、画像判定、レスの余白を二重実装しない。
 */
export function ThreadView({
  posts,
  error,
  onRefresh,
  threadUrl,
  autoRefreshEnabled = false,
  pollingEnabled = false,
  onPollingEnabledChange,
}: ThreadViewProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const canAutoRefreshRef = useRef(true);
  const lastObservedScrollHeightRef = useRef<number | null>(null);
  const [canAutoRefresh, setCanAutoRefresh] = useState(true);
  const [contextMenu, setContextMenu] = useState<ResponseContextMenuState | null>(null);

  const syncAutoRefreshBoundary = useCallback(() => {
    if (!autoRefreshEnabled) {
      canAutoRefreshRef.current = false;
      setCanAutoRefresh(false);
      return;
    }

    const container = getScrollContainer(rootRef.current);
    if (!container) {
      canAutoRefreshRef.current = true;
      setCanAutoRefresh(true);
      if (!pollingEnabled) {
        onPollingEnabledChange?.(true);
      }
      return;
    }

    const distanceFromBottom = Math.max(
      0,
      container.scrollHeight - (container.scrollTop + container.clientHeight),
    );
    const nextCanAutoRefresh = distanceFromBottom <= AUTO_REFRESH_BOUNDARY_PX;
    canAutoRefreshRef.current = nextCanAutoRefresh;
    setCanAutoRefresh((previous) =>
      previous === nextCanAutoRefresh ? previous : nextCanAutoRefresh,
    );
    if (pollingEnabled !== nextCanAutoRefresh) {
      onPollingEnabledChange?.(nextCanAutoRefresh);
    }
  }, [autoRefreshEnabled, onPollingEnabledChange, pollingEnabled]);

  useLayoutEffect(() => {
    syncAutoRefreshBoundary();
    const container = getScrollContainer(rootRef.current);
    if (!autoRefreshEnabled || !container) return;

    lastObservedScrollHeightRef.current = container.scrollHeight;
    const resizeObserver =
      typeof ResizeObserver === "undefined" || !rootRef.current
        ? null
        : new ResizeObserver(() => {
            const previousHeight = lastObservedScrollHeightRef.current;
            const currentHeight = container.scrollHeight;
            lastObservedScrollHeightRef.current = currentHeight;

            if (
              previousHeight != null &&
              currentHeight > previousHeight &&
              canAutoRefreshRef.current
            ) {
              // 変更理由: 画像読み込みや新着描画で本文が伸びても、ライン内にいた利用者だけ
              // 高さ差分へ追従させ、読み返し中のスクロール位置は奪わない。
              container.scrollBy({ top: currentHeight - previousHeight, behavior: "auto" });
            }
            syncAutoRefreshBoundary();
          });
    if (resizeObserver && rootRef.current) {
      resizeObserver.observe(rootRef.current);
    }

    container.addEventListener("scroll", syncAutoRefreshBoundary, { passive: true });
    window.addEventListener("resize", syncAutoRefreshBoundary);
    return () => {
      container.removeEventListener("scroll", syncAutoRefreshBoundary);
      window.removeEventListener("resize", syncAutoRefreshBoundary);
      resizeObserver?.disconnect();
      lastObservedScrollHeightRef.current = null;
    };
  }, [autoRefreshEnabled, posts.length, syncAutoRefreshBoundary]);

  useEffect(() => {
    // 自動更新を許可している時だけ新着へ追従し、停止中に手動更新した位置を奪わない。
    if (posts.length > lastCountRef.current && pollingEnabled) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
    lastCountRef.current = posts.length;
  }, [pollingEnabled, posts.length]);

  const handleAnchorClick = useCallback((resNum: number) => {
    const target = rootRef.current?.querySelector<HTMLElement>(`[data-res-num="${resNum}"]`);
    target?.scrollIntoView({ block: "center" });
  }, []);

  const handleResponseContextMenu = useCallback((event: MouseEvent, response: BrowserResponse) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      response,
      selectedText: window.getSelection()?.toString().trim() ?? "",
    });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu) return [];

    const copy = (text: string, label: string): ContextMenuItem => ({
      id: label,
      label,
      icon: <Copy size={14} />,
      onSelect: () => {
        void copyText(text).catch((error: unknown) => {
          console.error("[Chlens Live] response copy failed:", error);
        });
      },
    });

    return [
      ...(contextMenu.selectedText
        ? [
            copy(contextMenu.selectedText, "選択範囲をコピー"),
            { id: "copy-separator", separator: true },
          ]
        : []),
      copy(formatResForCopy(contextMenu.response), "レスをコピー"),
      {
        id: "refresh-thread",
        label: "スレを更新",
        icon: <RotateCw size={14} />,
        onSelect: onRefresh,
      },
    ];
  }, [contextMenu, onRefresh]);

  if (error) {
    return (
      <div className="thread-view__error" role="alert">
        スレの取得に失敗しました
        <button type="button" aria-label="再試行" title="再試行" onClick={onRefresh}>
          <RotateCw size={16} />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="thread-page live-thread-view">
      <div className="thread-page__responses" aria-label="レス一覧">
        {posts.map((post) => (
          <LiveResponse
            key={post.number}
            post={post}
            threadUrl={threadUrl}
            onAnchorClick={handleAnchorClick}
            onContextMenu={handleResponseContextMenu}
          />
        ))}
      </div>
      {autoRefreshEnabled ? (
        <div
          className={`thread-page__auto-scroll-threshold${
            canAutoRefresh ? " thread-page__auto-scroll-threshold--armed" : ""
          }`}
        >
          <div className="thread-page__auto-scroll-threshold-line" aria-hidden="true" />
          <span className="thread-page__auto-scroll-threshold-label">
            {canAutoRefresh
              ? "この線より下なので新着に追従します"
              : "この線より下にいる時だけ新着に追従します"}
          </span>
        </div>
      ) : null}
      <div ref={bottomRef} />
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      ) : null}
    </div>
  );
}

export function threadPosts(data: ThreadData): IRes[] {
  return data.posts;
}
