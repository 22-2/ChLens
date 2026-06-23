import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import { MediaViewerContainer } from "src/view/browser/components/MediaViewerContainer";
import { PopupRenderer } from "src/view/browser/components/PopupRenderer";
import { ResItem } from "src/view/browser/components/ResItem";
import { ThreadMinimap } from "src/view/browser/components/ThreadMinimap";
import { useAutoNextThread } from "src/view/browser/hooks/use-auto-next-thread";
import { useAutoNextThreadSetting } from "src/view/browser/hooks/use-auto-next-thread-setting";
import { useMediaViewerStore } from "src/view/browser/hooks/use-media-viewer-store";
import { useMouseGesture } from "src/view/browser/hooks/use-mouse-gesture";
import { useNgStatus } from "src/view/browser/hooks/use-ng-status";
import { useThreadPopupLifecycle } from "src/view/browser/hooks/use-popup-manager";
import { useTabDispatch } from "src/view/browser/hooks/use-tab-store";
import { useThreadAutoRefresh } from "src/view/browser/hooks/use-thread-auto-refresh";
import { useThreadData } from "src/view/browser/hooks/use-thread-data";
import { ThreadPageTopBar } from "src/view/browser/pages/thread/ThreadPageTopBar";
import { useImageBlurConfig } from "src/view/browser/pages/thread/use-image-blur-config";
import { useOwnResTracking } from "src/view/browser/pages/thread/use-own-res-tracking";
import { useResInteractionHandlers } from "src/view/browser/pages/thread/use-res-interaction-handlers";
import { useThreadReadState } from "src/view/browser/pages/thread/use-thread-read-state";
import { useThreadResContextMenu } from "src/view/browser/pages/thread/use-thread-res-context-menu";
import { useThreadTopBar } from "src/view/browser/pages/thread/use-thread-top-bar";
import { useThreadTopScrollOpenFilter } from "src/view/browser/pages/thread/use-thread-top-scroll-open-filter";
import { useUrlHandlers } from "src/view/browser/pages/thread/use-url-handlers";
import { getAutoRefreshPageKey } from "src/view/browser/utils/auto-refresh-pages";
import {
  buildBlurredResSet,
  buildReplyToWrittenResSet,
} from "src/view/browser/utils/thread-emphasis";
import type { Props } from "src/view/browser/utils/types";

interface ThreadPageProps {
  tabId: string;
  page: Props["page"];
  refreshKey: number;
  isActive: boolean;
  isAutoRefreshEnabled: boolean;
}

export const ThreadPage: React.FC<ThreadPageProps> = ({
  tabId,
  page,
  refreshKey,
  isActive,
  isAutoRefreshEnabled,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    responses,
    loading,
    error,
    expired,
    indexes,
    filteredResponses,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    fetchThread,
    idPositions,
    setResponses,
    messageProtocol,
  } = useThreadData(tabId, page, refreshKey);
  const dispatch = useTabDispatch();
  const { setThreadStats } = useNgStatus();
  const openMediaFromUrl = useMediaViewerStore(
    (state) => state.openMediaFromUrl,
  );
  const { enabled: isAutoNextThreadEnabled } = useAutoNextThreadSetting();

  const [miniAaResNums, setMiniAaResNums] = useState<Set<number>>(new Set());
  const { activeTopBar, closeTopBar, openFilterToolbar, searchFocusKey } =
    useThreadTopBar({ searchQuery, setSearchQuery });

  useMouseGesture(rootRef);

  const {
    popups,
    anchorPreviews,
    treePopupItems,
    idPopupItems,
    contextMenuItems,
    hasAnchorPreviews,
    addTreePopup,
    addPopupContextMenu,
    addIdPopup,
    clearAnchorPreviewHideTimer,
    closeNonContextPopups,
    closePopupById,
    closePopupChildren,
    isPopupDescendantOf,
    hasPopupChild,
    hideAnchorPreview,
    hideAnchorPreviewImmediately,
    showAnchorPreview,
  } = useThreadPopupLifecycle({
    scopeId: tabId,
    rootRef,
    resMap: indexes.resMap,
  });

  useThreadTopScrollOpenFilter({
    activeTopBar,
    isActive,
    openFilterToolbar,
    rootRef,
  });

  // 変更理由: 自動更新とステータスバー強調の条件を同一ソースに統一し、
  // タブ切替後に非アクティブタブの状態がステータスバーへ残留するのを防ぐ。
  const isActiveAutoRefreshEnabled = isActive && isAutoRefreshEnabled;

  const { autoScrollBoundaryRef, canAutoScroll, isAutoScrolling } =
    useThreadAutoRefresh({
      enabled: isActiveAutoRefreshEnabled,
      threadUrl: page.threadUrl,
      expired,
      loading,
      pauseAutoScroll: popups.length > 0,
      responseCount: responses.length,
      lastResponseNum: responses.at(-1)?.num ?? null,
      rootRef,
      requestRefresh: () => dispatch({ type: "RELOAD" }),
      // 新着が一定回数(=間隔×N)来なかったら、放置スレと判断して自動更新を止める。
      onAutoStop: () => {
        const pageKey = getAutoRefreshPageKey(page);
        if (pageKey == null) {
          return;
        }
        dispatch({
          type: "SET_AUTO_REFRESH_ENABLED",
          enabled: false,
          pageKey,
        });
        // 状態アイコンが消えるだけだと「いつ止まったか」が分かりにくいので明示する。
        container.toast.info("新着が止まったため自動更新を停止しました");
      },
    });

  const handleFollowNextThread = useCallback(
    (nextThread: Pick<IThread, "title" | "url">) => {
      dispatch({
        type: "FOLLOW_NEXT_THREAD",
        page: {
          type: "thread",
          title: nextThread.title,
          threadUrl: nextThread.url,
        },
        keepAutoRefresh: isAutoRefreshEnabled,
      });
    },
    [dispatch, isAutoRefreshEnabled],
  );

  useAutoNextThread({
    autoRefreshEnabled: isActiveAutoRefreshEnabled,
    featureEnabled: isAutoNextThreadEnabled,
    threadUrl: page.threadUrl,
    threadTitle: page.title,
    responseCount: responses.length,
    expired,
    canAutoScroll,
    followThread: handleFollowNextThread,
  });

  const imageBlurConfig = useImageBlurConfig();

  const { ownResNums, handleWriteHistoryAdded, handleWriteHistoryRemoved } =
    useOwnResTracking({
      threadUrl: page.threadUrl,
      threadTitle: page.title,
      responses,
    });

  const { scrollToResponse } = useThreadReadState({
    threadUrl: page.threadUrl,
    isActive,
    responses,
    loading,
    rootRef,
  });

  const { handleUrlClick, handleUrlContextMenu, openPopupUrlContextMenu } =
    useUrlHandlers({
      threadUrl: page.threadUrl,
      dispatch,
      openMediaFromUrl,
      addPopupContextMenu,
    });

  const {
    openAnchorPreviewFromPopup,
    handleIdClick,
    handlePopupIdClick,
    handleRepClick,
    closePopup,
    handleRepClickInPopup,
    handleOpenRootReplyTreeInPopup,
    handleAnchorClick,
  } = useResInteractionHandlers({
    indexes,
    addTreePopup,
    addIdPopup,
    showAnchorPreview,
    hideAnchorPreview,
    hideAnchorPreviewImmediately,
    clearAnchorPreviewHideTimer,
    closeNonContextPopups,
    scrollToResponse,
  });

  const replyToOwnResNums = useMemo(
    () => buildReplyToWrittenResSet(ownResNums, indexes.repIndex),
    [indexes.repIndex, ownResNums],
  );

  const threadNgCount = useMemo(
    () =>
      responses.filter((res) => res.ng != null || res.class?.includes("ng"))
        .length,
    [responses],
  );

  const ownHighlightCount = useMemo(() => {
    const highlightedResNums = new Set<number>(ownResNums);
    for (const resNum of replyToOwnResNums) {
      highlightedResNums.add(resNum);
    }
    return highlightedResNums.size;
  }, [ownResNums, replyToOwnResNums]);

  const blurredResNums = useMemo(() => {
    if (!imageBlurConfig.enabled) return new Set<number>();
    return buildBlurredResSet(
      responses,
      indexes.repIndex,
      imageBlurConfig.harmfulWordPattern,
    );
  }, [imageBlurConfig, indexes.repIndex, responses]);

  useEffect(() => {
    // ステータスバーの件数はページ外コンポーネントから参照するため、
    // スレッド側で集計して共有ストアへ反映する。
    setThreadStats({
      ngCount: threadNgCount,
      highlightCount: ownHighlightCount,
    });
    return () => {
      setThreadStats({ ngCount: 0, highlightCount: 0 });
    };
  }, [ownHighlightCount, setThreadStats, threadNgCount]);

  const { openPopupResContextMenu, openThreadResContextMenu } =
    useThreadResContextMenu({
      addPopupContextMenu,
      closePopup,
      fetchThread,
      filter,
      filteredResponses,
      handleAnchorClick,
      hideAnchorPreviewImmediately,
      miniAaResNums,
      ownResNums,
      page,
      onWriteHistoryAdded: handleWriteHistoryAdded,
      onWriteHistoryRemoved: handleWriteHistoryRemoved,
      searchQuery,
      setFilter,
      setSearchQuery,
      setMiniAaResNums,
      setResponses,
    });

  // 空白部分のダブルクリックによる更新。
  // 設定が有効な場合に動作し、誤操作防止のためリンクや画像、テキスト選択中などは除外する。
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (container.config.get("dblclick_reload") !== "on") return;

      const target = e.target as HTMLElement;

      // リンク、画像、入力系要素、ボタンなどは除外
      if (
        target.closest(
          "a, button, input, textarea, .res__thumb, .res__media-embed, .res__link",
        )
      ) {
        return;
      }

      // テキスト選択中はリロードしない
      if (window.getSelection()?.toString()) return;

      dispatch({ type: "RELOAD" });
    },
    [dispatch],
  );

  const isFilterEnabled = useMemo(
    () => filter !== "all" || searchQuery.trim() !== "",
    [filter, searchQuery],
  );

  // ジェスチャーuseEffectでrootRefが確実にマウント済みになるよう、loading中の早期returnを廃止し常にrootRef付きdivを描画する
  return (
    <div
      ref={rootRef}
      className="thread-page"
      onDoubleClick={handleDoubleClick}
    >
      {loading && responses.length === 0 ? (
        <div className="page-status">読み込み中...</div>
      ) : error && responses.length === 0 ? (
        <div className="page-status page-status--error">
          <p>{error}</p>
          <button className="page-status__retry" onClick={fetchThread}>
            再試行
          </button>
        </div>
      ) : (
        <>
          <ThreadPageTopBar
            activeTopBar={activeTopBar}
            filter={filter}
            filteredResponseCount={filteredResponses.length}
            onClose={closeTopBar}
            onFilterChange={setFilter}
            onSearchQueryChange={setSearchQuery}
            responseCount={responses.length}
            searchFocusKey={searchFocusKey}
            searchQuery={searchQuery}
          />

          {expired && (
            <div className="thread-page__notice">
              このスレッドはdat落ちしています
            </div>
          )}
          {error && <div className="thread-page__notice">{error}</div>}

          <div className="thread-page__responses">
            {filteredResponses.map((res) => {
              const idCount = res.id
                ? (indexes.idIndex.get(res.id)?.size ?? 0)
                : 0;
              const idPos = res.id ? (idPositions.get(res.num) ?? 0) : 0;
              const repCount = indexes.repIndex.get(res.num)?.size ?? 0;
              return (
                <ResItem
                  key={res.num}
                  res={res}
                  idPos={idPos}
                  idCount={idCount}
                  repCount={repCount}
                  miniAa={miniAaResNums.has(res.num)}
                  messageProtocol={messageProtocol}
                  onIdClick={handleIdClick}
                  onRepClick={handleRepClick}
                  onUrlClick={handleUrlClick}
                  onUrlContextMenu={handleUrlContextMenu}
                  onAnchorClick={handleAnchorClick}
                  onAnchorHover={showAnchorPreview}
                  onAnchorLeave={hideAnchorPreview}
                  onContextMenu={openThreadResContextMenu}
                  isOwn={ownResNums.has(res.num)}
                  isReplyToOwn={replyToOwnResNums.has(res.num)}
                  isImageBlurred={blurredResNums.has(res.num)}
                  imageBlurRadius={imageBlurConfig.radius}
                />
              );
            })}
          </div>

          {isActiveAutoRefreshEnabled &&
            /* 自動更新はフィルターが有効な場合は無効化 */
            !isFilterEnabled && (
              <div
                ref={autoScrollBoundaryRef}
                className={`thread-page__auto-scroll-threshold${
                  canAutoScroll
                    ? " thread-page__auto-scroll-threshold--armed"
                    : ""
                }${
                  isAutoScrolling
                    ? " thread-page__auto-scroll-threshold--scrolling"
                    : ""
                }`}
              >
                <span className="thread-page__auto-scroll-threshold-label">
                  {canAutoScroll
                    ? "この線より下なので新着に追従します"
                    : "この線より下にいる時だけ新着に追従します"}
                </span>
              </div>
            )}

          <PopupRenderer
            host={rootRef.current}
            anchorPreviews={anchorPreviews}
            idPopupItems={idPopupItems}
            treePopupItems={treePopupItems}
            contextMenuItems={contextMenuItems}
            messageProtocol={messageProtocol}
            repIndex={indexes.repIndex}
            idIndex={indexes.idIndex}
            resMap={indexes.resMap}
            hasAnchorPreviews={hasAnchorPreviews}
            hasPopupChild={hasPopupChild}
            isPopupDescendantOf={isPopupDescendantOf}
            onAnchorClick={handleAnchorClick}
            onAnchorHover={showAnchorPreview}
            onPopupAnchorHover={openAnchorPreviewFromPopup}
            onAnchorLeave={hideAnchorPreview}
            onClearAnchorPreviewHideTimer={clearAnchorPreviewHideTimer}
            onClosePopupById={closePopupById}
            onClosePopupChildren={closePopupChildren}
            onIdLinkClick={handleIdClick}
            onPopupIdLinkClick={handlePopupIdClick}
            onRepClickInPopup={handleRepClickInPopup}
            onOpenRootReplyTreeInPopup={handleOpenRootReplyTreeInPopup}
            onResContextMenuOpen={openPopupResContextMenu}
            onUrlClick={handleUrlClick}
            onUrlContextMenuOpen={openPopupUrlContextMenu}
            threadTitle={page.title}
            threadUrl={page.threadUrl}
            blurredResNums={blurredResNums}
          />
          <ThreadMinimap
            rootRef={rootRef}
            repIndex={indexes.repIndex}
            responseCount={filteredResponses.length}
            activeTopBar={activeTopBar}
            onMarkerClick={handleAnchorClick}
          />
          <MediaViewerContainer />
        </>
      )}
    </div>
  );
};
