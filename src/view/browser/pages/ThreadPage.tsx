import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import { useCommentOverlay } from "src/features/comment-overlay/application/use-comment-overlay";
import { MediaViewerContainer } from "src/view/browser/components/MediaViewerContainer";
import { PopupRenderer } from "src/view/browser/components/PopupRenderer";
import { ResItem } from "src/view/browser/components/ResItem";
import { ThreadMinimap } from "src/view/browser/components/ThreadMinimap";
import { WheelScrollIndicator } from "src/view/browser/components/WheelScrollIndicator";
import { useAutoNextThread } from "src/view/browser/hooks/use-auto-next-thread";
import { useAutoNextThreadSetting } from "src/view/browser/hooks/use-auto-next-thread-setting";
import { useMediaViewerStore } from "src/view/browser/hooks/use-media-viewer-store";
import { useMouseGesture } from "src/view/browser/hooks/use-mouse-gesture";
import { useNgStatus } from "src/view/browser/hooks/use-ng-status";
import { usePopupAutoScrollPauseSetting } from "src/view/browser/hooks/use-popup-auto-scroll-pause-setting";
import { useThreadPopupManager } from "src/view/browser/hooks/use-popup-manager";
import { useTabDispatch } from "src/view/browser/hooks/use-tab-store";
import { useThreadAutoRefresh } from "src/view/browser/hooks/use-thread-auto-refresh";
import { useThreadData } from "src/view/browser/hooks/use-thread-data";
import { useThreadRefreshController } from "src/view/browser/hooks/use-thread-refresh-controller";
import { useWheelPagination, WHEEL_THRESHOLD } from "src/view/browser/hooks/useWheelPagination";
import { ThreadPageTopBar } from "src/view/browser/pages/thread/ThreadPageTopBar";
import { useImageBlurConfig } from "src/view/browser/pages/thread/use-image-blur-config";
import { useOwnResTracking } from "src/view/browser/pages/thread/use-own-res-tracking";
import { useResInteractionHandlers } from "src/view/browser/pages/thread/use-res-interaction-handlers";
import { useThreadReadState } from "src/view/browser/pages/thread/use-thread-read-state";
import { useThreadResContextMenu } from "src/view/browser/pages/thread/use-thread-res-context-menu";
import { useThreadTopBar } from "src/view/browser/pages/thread/use-thread-top-bar";
import { useThreadTopScrollOpenFilter } from "src/view/browser/pages/thread/use-thread-top-scroll-open-filter";
import { useUrlHandlers } from "src/view/browser/pages/thread/use-url-handlers";
import { useCommentOverlaySync } from "src/view/browser/pages/thread/use-comment-overlay-sync";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import { Spinner } from "src/view/browser/ui/Spinner";
import { getAutoRefreshPageKey } from "src/view/browser/utils/auto-refresh-pages";
import {
  buildBlurredResSet,
  buildReplyToWrittenResSet,
} from "src/view/browser/utils/thread-emphasis";
interface ThreadPageProps {
  tabId: string;
  page: ThreadPageType;
  refreshKey: number;
  isActive: boolean;
  isAutoRefreshEnabled: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

export const ThreadPage: React.FC<ThreadPageProps> = ({
  tabId,
  page,
  refreshKey,
  isActive,
  isAutoRefreshEnabled,
  scrollContainerRef,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const fallbackScrollContainerRef = useRef<HTMLDivElement>(null);
  const effectiveScrollContainerRef = scrollContainerRef ?? fallbackScrollContainerRef;
  const refreshController = useThreadRefreshController(refreshKey);
  const {
    responses,
    visibleResponses,
    loading,
    error,
    expired,
    missingFromSubject,
    indexes,
    filteredResponses,
    filter,
    setFilter,
    searchTarget,
    setSearchTarget,
    searchQuery,
    setSearchQuery,
    fetchThread,
    idPositions,
    setResponses,
    messageProtocol,
  } = useThreadData(tabId, page, rootRef, refreshController);
  const { controller: commentOverlayController } = useCommentOverlay();
  const dispatch = useTabDispatch();

  useCommentOverlaySync({
    controller: commentOverlayController,
    threadUrl: page.threadUrl,
    responses,
    isActive,
    expired,
    missingFromSubject,
  });
  // 変更理由: 更新開始後のloading中もwheel更新の共有cooldownとindicatorを維持し、
  // 画面切替で別の一覧/スレッドから連続更新できる隙間を作らない。
  const wheelPagination = useWheelPagination({
    isEnabled: isActive,
    isLoading: loading,
    containerRef: effectiveScrollContainerRef,
    edge: "bottom",
    onRefresh: () => dispatch({ type: "RELOAD" }),
  });
  const { setThreadStats } = useNgStatus();
  const openMediaFromUrl = useMediaViewerStore((state) => state.openMediaFromUrl);
  const { enabled: isAutoNextThreadEnabled, mode: autoNextThreadMode } = useAutoNextThreadSetting();
  const autoNextThreadResponseMessages = useMemo(
    () => responses.map((response) => response.message),
    [responses],
  );

  const [miniAaResNums, setMiniAaResNums] = useState<Set<number>>(new Set());
  const {
    activeTopBar,
    closeTopBar,
    closeTopBarPreservingFilter,
    openFilterToolbar,
    searchFocusKey,
  } = useThreadTopBar({
    searchQuery,
    setSearchQuery,
    hasActiveFilter: filter !== "all",
  });

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
    toggleTreePopupPinned,
    hasPopupChild,
    hideAnchorPreview,
    hideAnchorPreviewImmediately,
    showAnchorPreview,
  } = useThreadPopupManager({
    scopeId: tabId,
    rootRef,
    resMap: indexes.resMap,
  });

  useThreadTopScrollOpenFilter({
    activeTopBar,
    closeTopBar: closeTopBarPreservingFilter,
    isActive,
    openFilterToolbar,
    rootRef,
  });

  // 変更理由: 自動更新とステータスバー強調の条件を同一ソースに統一し、
  // タブ切替後に非アクティブタブの状態がステータスバーへ残留するのを防ぐ。
  const isActiveAutoRefreshEnabled = isActive && isAutoRefreshEnabled;
  // 変更理由: 画面上はいずれも dat 落ち案内を表示する状態であり、
  // 自動更新中にどちらかを取得したら、Issue #29 の完了条件に従って停止処理へ渡す。
  const autoRefreshExpired = expired || missingFromSubject;
  const { enabled: pauseAutoScrollOnPopup } = usePopupAutoScrollPauseSetting();

  // 変更理由: 停止理由が増えても、タブ状態の解除と利用者への通知を同じ経路で行い、
  // 一方だけ実行される不整合を防ぐ。
  const handleAutoRefreshStop = useCallback(
    (message: string) => {
      const pageKey = getAutoRefreshPageKey(page);
      if (pageKey == null) {
        return;
      }
      dispatch({
        type: "SET_AUTO_REFRESH_ENABLED",
        enabled: false,
        pageKey,
      });
      container.toast.info(message);
    },
    [dispatch, page],
  );

  const { autoScrollBoundaryRef, canAutoScroll, isAutoScrolling } = useThreadAutoRefresh({
    enabled: isActiveAutoRefreshEnabled,
    threadUrl: page.threadUrl,
    refreshController,
    expired: autoRefreshExpired,
    loading,
    // 変更理由: ポップアップを読みながら新着へ流されない従来動作を、
    // ユーザーが用途に合わせて無効化できるようにする。
    pauseAutoScroll: pauseAutoScrollOnPopup && popups.length > 0,
    responseCount: responses.length,
    lastResponseNum: responses.at(-1)?.num ?? null,
    rootRef,
    requestRefresh: () => dispatch({ type: "RELOAD" }),
    // 新着が一定回数(=間隔×N)来なかったら、放置スレと判断して自動更新を止める。
    onAutoStop: () => handleAutoRefreshStop("新着が止まったため自動更新を停止しました"),
    // interval の停止だけではタブに自動更新状態が残るため、dat落ち時も明示的に解除する。
    onThreadExpired: () => handleAutoRefreshStop("dat落ちを検知したため自動更新を停止しました"),
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
    mode: autoNextThreadMode,
    responseMessages: autoNextThreadResponseMessages,
    canAutoScroll,
    followThread: handleFollowNextThread,
  });

  const imageBlurConfig = useImageBlurConfig();

  const { ownResNums, handleWriteHistoryAdded, handleWriteHistoryRemoved } = useOwnResTracking({
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

  const handleMinimapMarkerClick = useCallback(
    (resNum: number) => {
      // ミニマップはポップアップを閉じる状態更新を挟むとCSS animationが打ち消されうるため、
      // 対象レスへ直接ジャンプしてハイライトを確実に開始する。
      scrollToResponse(resNum, { highlight: true });
    },
    [scrollToResponse],
  );

  const { handleUrlClick, handleUrlContextMenu, openPopupUrlContextMenu } = useUrlHandlers({
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
    () => responses.filter((res) => res.ng != null || res.class?.includes("ng")).length,
    [responses],
  );
  const ngResNums = useMemo(
    () =>
      new Set(
        responses
          .filter((res) => res.ng != null || res.class?.includes("ng"))
          .map((res) => res.num),
      ),
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
    return buildBlurredResSet(responses, indexes.repIndex, imageBlurConfig.harmfulWordPattern);
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

  const { openPopupResContextMenu, openThreadResContextMenu } = useThreadResContextMenu({
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
        target.closest("a, button, input, textarea, .res__thumb, .res__media-embed, .res__link")
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
    <div ref={rootRef} className="thread-page" onDoubleClick={handleDoubleClick}>
      <WheelScrollIndicator
        {...wheelPagination}
        threshold={WHEEL_THRESHOLD}
        portalContainerRef={effectiveScrollContainerRef}
      />
      {loading && responses.length === 0 ? (
        <div className="page-status">
          <Spinner size="sm" aria-label="スレッドを読み込み中" />
          <span>スレッドを読み込み中...</span>
        </div>
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
            onSearchTargetChange={setSearchTarget}
            onSearchQueryChange={setSearchQuery}
            responseCount={visibleResponses.length}
            searchFocusKey={searchFocusKey}
            searchQuery={searchQuery}
            searchTarget={searchTarget}
          />

          {(expired || missingFromSubject) && (
            <div className="thread-page__notice">このスレッドはdat落ちしています</div>
          )}
          {error && <div className="thread-page__notice">{error}</div>}

          <div className="thread-page__responses">
            {filteredResponses.map((res) => {
              const idCount = res.id ? (indexes.idIndex.get(res.id)?.size ?? 0) : 0;
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
                  searchQuery={searchQuery}
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
                  ngResNums={ngResNums}
                  threadUrl={page.threadUrl}
                />
              );
            })}
          </div>

          {isActiveAutoRefreshEnabled &&
            /* 自動更新はフィルターが有効な場合は無効化 */
            !isFilterEnabled && (
              <div
                className={`thread-page__auto-scroll-threshold${
                  canAutoScroll ? " thread-page__auto-scroll-threshold--armed" : ""
                }${isAutoScrolling ? " thread-page__auto-scroll-threshold--scrolling" : ""}`}
              >
                {/* 変更理由: 親要素の末尾は破線より16px下にあるため、親へrefを置くと
                    見た目では線を越えていても追従判定がfalseになる。判定点を実際の破線へ揃える。 */}
                <div
                  ref={autoScrollBoundaryRef}
                  className="thread-page__auto-scroll-threshold-line"
                  aria-hidden="true"
                />
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
            onToggleTreePopupPinned={toggleTreePopupPinned}
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
            ngResNums={ngResNums}
          />
          <ThreadMinimap
            rootRef={rootRef}
            repIndex={indexes.repIndex}
            responseCount={filteredResponses.length}
            activeTopBar={activeTopBar}
            onMarkerClick={handleMinimapMarkerClick}
          />
          <MediaViewerContainer />
        </>
      )}
    </div>
  );
};
