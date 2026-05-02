import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { IRes } from "src/service-container/interfaces";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import { MediaViewerContainer } from "src/view/browser/components/MediaViewerContainer";
import { PopupRenderer } from "src/view/browser/components/PopupRenderer";
import { ResItem } from "src/view/browser/components/ResItem";
import { StatusBarMode } from "src/view/browser/components/StatusBar";
import { ThreadMinimap } from "src/view/browser/components/ThreadMinimap";
import { useMediaViewerStore } from "src/view/browser/hooks/use-media-viewer-store";
import { useMouseGesture } from "src/view/browser/hooks/use-mouse-gesture";
import { useNgStatus } from "src/view/browser/hooks/use-ng-status";
import { useThreadPopupLifecycle } from "src/view/browser/hooks/use-popup-manager";
import { useTabDispatch } from "src/view/browser/hooks/use-tab-store";
import { useThreadAutoRefresh } from "src/view/browser/hooks/use-thread-auto-refresh";
import { useThreadData } from "src/view/browser/hooks/use-thread-data";
import {
  parseInternalBrowserPage,
  resolveAbsoluteUrl,
  RESPECT_DEFAULT_EXTERNAL,
} from "src/view/browser/utils/link-routing";
import { ThreadPageTopBar } from "src/view/browser/pages/thread/ThreadPageTopBar";
import { useThreadResContextMenu } from "src/view/browser/pages/thread/use-thread-res-context-menu";
import { useThreadTopBar } from "src/view/browser/pages/thread/use-thread-top-bar";
import { resolveReplyTreeRootResNum } from "src/view/browser/utils/reply-tree-root";
import type { Props } from "src/view/browser/utils/types";
import { copyText } from "src/view/browser/utils/utils";

interface ThreadPageProps {
  tabId: string;
  page: Props["page"];
  refreshKey: number;
  isAutoRefreshEnabled: boolean;
}
export const ThreadPage: React.FC<ThreadPageProps> = ({
  tabId,
  page,
  refreshKey,
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

  const [miniAaResNums, setMiniAaResNums] = useState<Set<number>>(new Set());
  const { activeTopBar, closeTopBar, searchFocusKey } = useThreadTopBar({
    searchQuery,
    setSearchQuery,
  });

  const { autoScrollBoundaryRef, canAutoScroll, isAutoScrolling } =
    useThreadAutoRefresh({
      enabled: isAutoRefreshEnabled,
      threadUrl: page.threadUrl,
      expired,
      loading,
      pauseAutoScroll: popups.length > 0,
      responseCount: responses.length,
      lastResponseNum: responses.at(-1)?.num ?? null,
      rootRef,
      requestRefresh: () => dispatch({ type: "RELOAD" }),
    });
  const threadNgCount = useMemo(
    () =>
      responses.filter((res) => res.ng != null || res.class?.includes("ng"))
        .length,
    [responses],
  );

  useEffect(() => {
    // ステータスバーの件数はページ外コンポーネントから参照するため、
    // スレッド側で集計して共有ストアへ反映する。
    setThreadStats({ ngCount: threadNgCount, highlightCount: 0 });
    return () => {
      setThreadStats({ ngCount: 0, highlightCount: 0 });
    };
  }, [setThreadStats, threadNgCount]);

  const openAnchorPreviewFromPopup = useCallback(
    (popupId: string) =>
      (
        targets: number[],
        anchorRect: DOMRect,
        label: string,
        depth: number,
      ) => {
        // depth=0 のアンカーは popup 内から開かれたことを親子ツリーへ残さないと、
        // その後の返信/右クリックメニューで root 扱いになって祖先との寿命がずれる。
        showAnchorPreview(targets, anchorRect, label, depth, popupId);
      },
    [showAnchorPreview],
  );

  const openResolvedUrl = useCallback(
    (
      absoluteUrl: string,
      button: 0 | 1,
      resImages?: string[],
      internalPage = parseInternalBrowserPage(absoluteUrl),
    ) => {
      if (internalPage) {
        // 5ch互換URLは外部ブラウザではなく拡張内で開く。
        if (button === 1) {
          dispatch({ type: "OPEN_IN_NEW_TAB", page: internalPage });
        } else {
          dispatch({ type: "NAVIGATE", page: internalPage });
        }
        return;
      }

      if (button === 1) {
        window.open(absoluteUrl, "_blank", "noopener,noreferrer");
        return;
      }

      openMediaFromUrl(absoluteUrl, resImages);
    },
    [dispatch, openMediaFromUrl],
  );

  const handleUrlClick = useCallback(
    (
      rawUrl: string,
      resImages?: string[],
      button: 0 | 1 = 0,
      mode?: typeof RESPECT_DEFAULT_EXTERNAL,
    ) => {
      const absoluteUrl = resolveAbsoluteUrl(rawUrl, page.threadUrl);
      const internalPage = parseInternalBrowserPage(absoluteUrl);
      if (mode === RESPECT_DEFAULT_EXTERNAL) {
        // 本文中の通常リンクでは、対応ホストのURLだけ拡張内遷移で横取りする。
        // 非対応ホストは未処理(false)を返してブラウザ既定の左/中/右挙動へ委譲する。
        if (!internalPage) {
          return false;
        }
      }
      openResolvedUrl(absoluteUrl, button, resImages, internalPage);
      return true;
    },
    [openResolvedUrl, page.threadUrl],
  );

  const buildUrlContextMenuItems = useCallback(
    (
      absoluteUrl: string,
      internalPage = parseInternalBrowserPage(absoluteUrl),
    ): ContextMenuItem[] => {
      return [
        {
          id: "open-in-current",
          label: internalPage ? "拡張内で開く" : "開く",
          onSelect: () =>
            openResolvedUrl(absoluteUrl, 0, undefined, internalPage),
        },
        {
          id: "open-in-new-tab",
          label: internalPage ? "拡張内の新しいタブで開く" : "新しいタブで開く",
          onSelect: () =>
            openResolvedUrl(absoluteUrl, 1, undefined, internalPage),
        },
        { id: "sep-url-1", separator: true },
        {
          id: "copy-url",
          label: "URLをコピー",
          onSelect: () => {
            void copyText(absoluteUrl);
          },
        },
        {
          id: "open-in-browser",
          label: "ブラウザで開く",
          onSelect: () => {
            window.open(absoluteUrl, "_blank", "noopener,noreferrer");
          },
        },
      ];
    },
    [openResolvedUrl],
  );

  const handleUrlContextMenu = useCallback(
    (
      rawUrl: string,
      e: React.MouseEvent,
      parentId?: string,
      mode?: typeof RESPECT_DEFAULT_EXTERNAL,
    ) => {
      const absoluteUrl = resolveAbsoluteUrl(rawUrl, page.threadUrl);
      const internalPage = parseInternalBrowserPage(absoluteUrl);
      if (mode === RESPECT_DEFAULT_EXTERNAL) {
        // 非5ch互換URLはネイティブの右クリックメニューを優先する。
        if (!internalPage) {
          return false;
        }
      }
      addPopupContextMenu(
        e.clientX,
        e.clientY,
        buildUrlContextMenuItems(absoluteUrl, internalPage),
        parentId,
      );
      return true;
    },
    [addPopupContextMenu, buildUrlContextMenuItems, page.threadUrl],
  );

  // IDクリック → そのIDの全レスをポップアップ表示
  const handleIdClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      // message 内の anchor_id は ID: 付き、ヘッダー側は生値、のように揺れることがあるため
      // 両方を試して同じIDインデックスへ合流させる。
      const candidateIds = id.startsWith("ID:")
        ? [id, id.replace(/^ID:/i, "")]
        : [id, `ID:${id}`];
      const resolvedId = candidateIds.find((candidate) =>
        indexes.idIndex.has(candidate),
      );
      const resNums = resolvedId ? indexes.idIndex.get(resolvedId) : undefined;
      if (!resNums) return;
      hideAnchorPreviewImmediately();
      const items = Array.from(resNums)
        .sort((a, b) => a - b)
        .map((num) => indexes.resMap.get(num))
        .filter((r): r is IRes => !!r);
      closeNonContextPopups();
      const displayId = (resolvedId ?? id).startsWith("ID:")
        ? (resolvedId ?? id)
        : `ID:${resolvedId ?? id}`;
      addIdPopup(
        e.clientX,
        e.clientY,
        items,
        `${displayId} (${items.length}件)`,
      );
    },
    [indexes, hideAnchorPreviewImmediately, closeNonContextPopups, addIdPopup],
  );

  const handlePopupIdClick = useCallback(
    (parentId: string) => (id: string, e: React.MouseEvent) => {
      // popup内クリックは親popupスタックを維持し、子としてID popupを開く。
      // ここで全閉じすると「anchor_idで開いた瞬間に親が消える」ため closeNonContextPopups は呼ばない。
      const candidateIds = id.startsWith("ID:")
        ? [id, id.replace(/^ID:/i, "")]
        : [id, `ID:${id}`];
      const resolvedId = candidateIds.find((candidate) =>
        indexes.idIndex.has(candidate),
      );
      const resNums = resolvedId ? indexes.idIndex.get(resolvedId) : undefined;
      if (!resNums) return;
      clearAnchorPreviewHideTimer();
      const items = Array.from(resNums)
        .sort((a, b) => a - b)
        .map((num) => indexes.resMap.get(num))
        .filter((r): r is IRes => !!r);
      const displayId = (resolvedId ?? id).startsWith("ID:")
        ? (resolvedId ?? id)
        : `ID:${resolvedId ?? id}`;
      addIdPopup(
        e.clientX,
        e.clientY,
        items,
        `${displayId} (${items.length}件)`,
        parentId,
      );
    },
    [addIdPopup, clearAnchorPreviewHideTimer, indexes.idIndex, indexes.resMap],
  );

  // 返信クリック → 返信ツリーをポップアップ表示（スレッド本文から）
  const handleRepClick = useCallback(
    (resNum: number, e: React.MouseEvent) => {
      hideAnchorPreviewImmediately();
      closeNonContextPopups();
      addTreePopup(resNum, e.clientX, e.clientY);
    },
    [hideAnchorPreviewImmediately, closeNonContextPopups, addTreePopup],
  );

  const closePopup = useCallback(() => {
    hideAnchorPreviewImmediately();
    closeNonContextPopups();
  }, [hideAnchorPreviewImmediately, closeNonContextPopups]);

  // ポップアップ/アンカープレビュー内からの返信クリック。
  // アンカープレビューを即時消去せず、スタックに積んで親子関係を維持する。
  const handleRepClickInPopup = useCallback(
    (parentId?: string, anchorPreviewDepth = 0) =>
      (resNum: number, e: React.MouseEvent) => {
        clearAnchorPreviewHideTimer();
        // アンカープレビュー配下で開いた返信ツリーは、その深さを持ち回って
        // 次のアンカーホバーでも親プレビューを巻き込んで閉じないようにする。
        addTreePopup(
          resNum,
          e.clientX,
          e.clientY,
          parentId,
          anchorPreviewDepth,
        );
      },
    [addTreePopup, clearAnchorPreviewHideTimer],
  );

  const handleOpenRootReplyTreeInPopup = useCallback(
    (parentId?: string, anchorPreviewDepth = 0) =>
      (resNum: number, e: React.MouseEvent) => {
        clearAnchorPreviewHideTimer();
        // 葉のアンカーから辿る時は起点レスを ancIndex で逆引きしてから開くことで、
        // 相互アンカーが続くケースでも最初の流れを辿りやすくする。
        const rootResNum = resolveReplyTreeRootResNum(
          resNum,
          indexes.ancIndex,
          indexes.resMap,
        );
        addTreePopup(
          rootResNum,
          e.clientX,
          e.clientY,
          parentId,
          anchorPreviewDepth,
        );
      },
    [
      addTreePopup,
      clearAnchorPreviewHideTimer,
      indexes.ancIndex,
      indexes.resMap,
    ],
  );

  // アンカークリックで該当レスへスクロール
  const handleAnchorClick = useCallback(
    (resNum: number) => {
      const host = rootRef.current;
      if (!host) return;
      // ポップアップ上のアンカークリックでも遷移先を確実に視認できるよう、
      // ジャンプ時はいったん非メニュー系ポップアップを閉じて本文へフォーカスを戻す。
      closeNonContextPopups();
      const target = host.querySelector(
        `.thread-page__responses [data-res-num="${resNum}"]`,
      );
      if (!target) return;
      // 実スクロールは content-area ではなく tab panel 側なので、
      // ここを誤ると scrollTop を更新しても見た目が動かずジャンプ不能になる。
      const scrollContainer = host.closest(".content-area__tab-panel");
      if (
        scrollContainer instanceof HTMLElement &&
        target instanceof HTMLElement
      ) {
        // ThreadPageでは tab panel が実スクロールコンテナなので、そこへ直接位置合わせする。
        const targetRect = target.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        const nextScrollTop =
          scrollContainer.scrollTop + targetRect.top - containerRect.top;
        scrollContainer.scrollTo({
          top: Math.max(0, nextScrollTop),
          behavior: "auto",
        });
      } else {
        target.scrollIntoView({ behavior: "auto", block: "start" });
      }
      // 視認性のためハイライトアニメーションを付与
      target.classList.add("res--highlighted");
      target.addEventListener(
        "animationend",
        () => target.classList.remove("res--highlighted"),
        { once: true },
      );
    },
    [closeNonContextPopups],
  );

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
      page,
      setFilter,
      setMiniAaResNums,
      setResponses,
    });

  const openPopupUrlContextMenu = useCallback(
    (parentId: string) =>
      (
        rawUrl: string,
        e: React.MouseEvent,
        mode?: typeof RESPECT_DEFAULT_EXTERNAL,
      ) => {
        handleUrlContextMenu(rawUrl, e, parentId, mode);
      },
    [handleUrlContextMenu],
  );

  // ジェスチャーuseEffectでrootRefが確実にマウント済みになるよう、loading中の早期returnを廃止し常にrootRef付きdivを描画する
  return (
    <div ref={rootRef} className="thread-page">
      {isAutoRefreshEnabled && (
        <>
          {/* 線より下にいて新着追従が有効な間だけステータスバーを accent 化し、
              「今の位置なら自動スクロールされる」を常時見分けやすくする。 */}
          <StatusBarMode
            id="thread-auto-scroll-mode"
            appearance={canAutoScroll || isAutoScrolling ? "active" : null}
          />
        </>
      )}
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
                />
              );
            })}
          </div>

          {isAutoRefreshEnabled && (
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
