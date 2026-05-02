import {
  ArrowDown,
  Ban,
  Copy,
  Globe,
  History,
  Reply,
  Search,
  Type,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import { MediaViewerContainer } from "src/view/browser/components/MediaViewerContainer";
import { PopupRenderer } from "src/view/browser/components/PopupRenderer";
import { ResItem } from "src/view/browser/components/ResItem";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { StatusBarMode } from "src/view/browser/components/StatusBar";
import { useMediaViewerStore } from "src/view/browser/hooks/use-media-viewer-store";
import { useMouseGesture } from "src/view/browser/hooks/use-mouse-gesture";
import { useNgStatus } from "src/view/browser/hooks/use-ng-status";
import { useThreadPopupLifecycle } from "src/view/browser/hooks/use-popup-manager";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useThreadAutoRefresh } from "src/view/browser/hooks/use-thread-auto-refresh";
import { useThreadData } from "src/view/browser/hooks/use-thread-data";
import {
  parseInternalBrowserPage,
  resolveAbsoluteUrl,
  RESPECT_DEFAULT_EXTERNAL,
} from "src/view/browser/utils/link-routing";
import type { Props, ThreadFilter } from "src/view/browser/utils/types";
import {
  buildKyodemoUrl,
  copyText,
  stripHtml,
} from "src/view/browser/utils/utils";

export const ThreadPage: React.FC<Props> = ({ tabId, page, refreshKey }) => {
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
    showSearch,
    setShowSearch,
    fetchThread,
    idPositions,
    setResponses,
    messageProtocol,
  } = useThreadData(tabId, page, refreshKey);
  const { dispatch, activeTab } = useTabStore();
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
  const isAutoRefreshEnabled =
    activeTab.autoRefreshEnabled &&
    activeTab.autoRefreshThreadUrl === page.threadUrl;

  const { autoScrollBoundaryRef, canAutoScroll, isAutoScrolling } =
    useThreadAutoRefresh({
      threadUrl: page.threadUrl,
      expired,
      loading,
      pauseAutoScroll: popups.length > 0,
      responseCount: responses.length,
      lastResponseNum: responses.at(-1)?.num ?? null,
      rootRef,
    });
  const threadNgCount = useMemo(
    () =>
      responses.filter((res) => res.ng != null || res.class?.includes("ng")).length,
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

  // 検索バーはURLバー右メニューからのみ開く。
  // （Ctrl+F割り当ては無効化して、ブラウザ/OS標準ショートカットを優先する）
  useEffect(() => {
    const handleOpenSearch = () => {
      setShowSearch(true);
    };
    window.addEventListener("thread-search-open", handleOpenSearch);
    return () =>
      window.removeEventListener("thread-search-open", handleOpenSearch);
  }, [setShowSearch]);

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

  const addIdToNg = useCallback(async (id: string | undefined) => {
    if (!id) return;
    const ngWord = id.startsWith("ID:") ? id : `ID:${id}`;
    // 既存実装の「ID/IPをNG指定」と同じくNGサービスへ直接追加
    container.ng.add(ngWord);
    // サービス側への追加だけでは再取得するまでUIに反映されないため、ローカルのstateも即時更新する。
    // id は targetRes.id そのもの（"ID:xxx" 形式の場合もある）なので、そのまま res.id と比較する。
    setResponses((prev) =>
      prev.map((res) =>
        res.id === id
          ? {
              ...res,
              // res.ng を設定することで ResItem の isNG 判定が即座に true になる
              ng: { type: "id" },
              class: [...(res.class ?? []).filter((c) => c !== "ng"), "ng"],
            }
          : res,
      ),
    );
    container.notification.info(`NGに追加しました: ${ngWord}`);
  }, []);

  const addWriteHistory = useCallback(
    async (res: IRes) => {
      const globalObj = window as unknown as {
        app?: {
          WriteHistory?: {
            add: (item: {
              url: string;
              res: number;
              title: string;
              name: string;
              mail: string;
              message: string;
              date: number;
            }) => Promise<void> | void;
          };
        };
      };

      if (!globalObj.app?.WriteHistory?.add) {
        container.notification.info("書込履歴サービスが利用できません");
        return;
      }

      const name = stripHtml(res.name);
      const message = stripHtml(res.message);
      const baseTime = Date.parse(res.date ?? res.other ?? "");
      await globalObj.app.WriteHistory.add({
        url: page.threadUrl,
        res: res.num,
        title: document.title,
        name,
        mail: res.mail,
        message,
        date: Number.isNaN(baseTime) ? Date.now() : baseTime,
      });
      container.notification.success("書込履歴に追加しました");
    },
    [page.threadUrl],
  );

  const filterButtons: { key: ThreadFilter; label: string }[] = [
    { key: "all", label: "全て" },
    { key: "popular", label: "多レス" },
    { key: "image", label: "画像" },
    { key: "video", label: "動画" },
    { key: "link", label: "リンク" },
  ];

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

  /**
   * コンテキストメニュー項目を生成する汎用関数。
   * fromPopup=true のときはポップアップ固有の「このレスにジャンプ」を先頭に追加する。
   */
  const buildContextMenuItems = useCallback(
    (targetRes: IRes, fromPopup: boolean) => {
      const plainName = stripHtml(targetRes.name);
      const plainMessage = stripHtml(targetRes.message);
      const rawId = targetRes.id ?? "";
      const kyodemoUrl = rawId ? buildKyodemoUrl(page.threadUrl, rawId) : null;
      const permalink = `${page.threadUrl}${targetRes.num}`;
      const isMiniAa = miniAaResNums.has(targetRes.num);

      return [
        ...(fromPopup
          ? [
              {
                id: "jump-to-res",
                label: "このレスにジャンプ",
                icon: <ArrowDown size={14} />,
                onSelect: () => {
                  handleAnchorClick(targetRes.num);
                  closePopup();
                },
              },
              { id: "sep-jump", separator: true },
            ]
          : []),
        {
          id: "copy-res",
          label: "レスをコピー",
          icon: <Copy size={14} />,
          onSelect: async () => {
            const copyBody = `${page.title}\n${page.threadUrl}${
              targetRes.num
            }\n${targetRes.num} ${plainName}  ${
              targetRes.date ?? targetRes.other ?? ""
            }\n${plainMessage}`;
            await copyText(copyBody);
          },
        },
        {
          id: "copy-id",
          label: "ID/IPをコピー",
          icon: <Copy size={14} />,
          disabled: !rawId,
          onSelect: async () => {
            await copyText(rawId);
          },
        },
        {
          id: "search-id",
          label: "IDを必死チェッカーで検索",
          icon: <Search size={14} />,
          disabled: !kyodemoUrl,
          onSelect: () => {
            if (kyodemoUrl) {
              window.open(kyodemoUrl, "_blank", "noopener,noreferrer");
            }
          },
        },
        {
          id: "add-ng-id",
          label: "ID/IPをNG指定",
          icon: <Ban size={14} />,
          disabled: !rawId,
          onSelect: () => {
            void addIdToNg(rawId);
          },
        },
        { id: "sep-1", separator: true },
        {
          id: "reply",
          label: "返信",
          icon: <Reply size={14} />,
          onSelect: () => {
            void copyText(`>>${targetRes.num}\n`);
            container.notification.info("返信アンカーをコピーしました");
          },
        },
        {
          id: "quote-reply",
          label: "引用して返信",
          icon: <Reply size={14} />,
          onSelect: () => {
            const quoted = plainMessage
              .split(/\r?\n/)
              .map((line) => `>${line}`)
              .join("\n");
            void copyText(`>>${targetRes.num}\n${quoted}\n`);
            container.notification.info("引用テンプレートをコピーしました");
          },
        },
        {
          id: "add-write-history",
          label: "書込履歴に追加",
          icon: <History size={14} />,
          onSelect: () => {
            void addWriteHistory(targetRes);
          },
        },
        {
          id: "toggle-aa",
          label: isMiniAa ? "AA表示モードを解除" : "AA表示モードに変更",
          icon: <Type size={14} />,
          onSelect: () => {
            setMiniAaResNums((prev) => {
              const next = new Set(prev);
              if (next.has(targetRes.num)) {
                next.delete(targetRes.num);
              } else {
                next.add(targetRes.num);
              }
              return next;
            });
          },
        },
        {
          id: "open-browser",
          label: "ブラウザで開く",
          icon: <Globe size={14} />,
          onSelect: () => {
            window.open(permalink, "_blank", "noopener,noreferrer");
          },
        },
      ];
    },
    [
      addIdToNg,
      addWriteHistory,
      closePopup,
      handleAnchorClick,
      miniAaResNums,
      page.threadUrl,
      page.title,
      setMiniAaResNums,
    ],
  );

  const openResContextMenu = useCallback(
    (
      targetRes: IRes,
      e: React.MouseEvent,
      fromPopup: boolean,
      parentId?: string,
    ) => {
      e.preventDefault();
      if (!fromPopup) {
        hideAnchorPreviewImmediately();
      }

      // メニュー本体も同じスタックへ積み、parentId で親ポップアップとの寿命を揃える。
      addPopupContextMenu(
        e.clientX,
        e.clientY,
        buildContextMenuItems(targetRes, fromPopup),
        parentId,
      );
    },
    [addPopupContextMenu, buildContextMenuItems, hideAnchorPreviewImmediately],
  );

  const openPopupResContextMenu = useCallback(
    (parentId: string) => (targetRes: IRes, e: React.MouseEvent) => {
      openResContextMenu(targetRes, e, true, parentId);
    },
    [openResContextMenu],
  );

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

  const openThreadResContextMenu = useCallback(
    (e: React.MouseEvent, res: IRes) => {
      openResContextMenu(res, e, false);
    },
    [openResContextMenu],
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
          {/* フィルタツールバー */}
          <div className="thread-page__toolbar">
            <div className="thread-page__filters">
              {filterButtons.map(({ key, label }) => (
                <button
                  key={key}
                  className={`thread-page__filter-btn${
                    filter === key ? " thread-page__filter-btn--active" : ""
                  }`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="thread-page__count">
              {filteredResponses.length}/{responses.length}件
            </span>
          </div>

          {showSearch && (
            <SearchBar
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onClose={() => {
                setShowSearch(false);
                setSearchQuery("");
              }}
              hitCount={filteredResponses.length}
            />
          )}

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
            onResContextMenuOpen={openPopupResContextMenu}
            onUrlClick={handleUrlClick}
            onUrlContextMenuOpen={openPopupUrlContextMenu}
          />
          <MediaViewerContainer />
        </>
      )}
    </div>
  );
};
