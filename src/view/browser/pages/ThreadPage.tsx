import { ArrowDown, Ban, Copy, Globe, History, Reply, Search, Type } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";
import { AnchorPreview } from "src/view/browser/components/AnchorPreview";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { useMouseGesture } from "src/view/browser/hooks/use-mouse-gesture";
import { useMediaViewer } from "src/view/browser/hooks/use-media-viewer";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useThreadData } from "src/view/browser/hooks/use-thread-data";
import {
  ANCHOR_PREVIEW_GUTTER,
  ANCHOR_PREVIEW_HIDE_DELAY_MS,
  ANCHOR_PREVIEW_MAX_WIDTH,
  ANCHOR_PREVIEW_OFFSET,
} from "src/view/browser/utils/constants";
import { ReplyTreePopup } from "src/view/browser/components/ReplyTreePopup";
import { ResItem } from "src/view/browser/components/ResItem";
import { ResPopup } from "src/view/browser/components/ResPopup";
import { usePopupManager } from "src/view/browser/hooks/use-popup-manager";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
  IdPopupItem,
  Props,
  ThreadFilter,
  TreePopupItem,
} from "src/view/browser/utils/types";
import { buildKyodemoUrl, copyText, stripHtml } from "src/view/browser/utils/utils";

export const ThreadPage: React.FC<Props> = ({ page, refreshKey }) => {
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
  } = useThreadData(page, refreshKey);
  const { dispatch } = useTabStore();
  const {
    viewer,
    viewerScale,
    viewerStageRef,
    openMediaFromUrl,
    closeViewer,
    navigateViewer,
    setViewerScale,
  } = useMediaViewer();
  const {
    popups,
    addPopup,
    closePopupById,
    closePopupsByPredicate,
  } = usePopupManager();

  useMouseGesture(rootRef);

  const [miniAaResNums, setMiniAaResNums] = useState<Set<number>>(new Set());
  const anchorPreviewHideTimerRef = useRef<number | null>(null);

  const closeNonContextPopups = useCallback(() => {
    closePopupsByPredicate((item) => item.type !== "contextMenu");
  }, [closePopupsByPredicate]);

  const anchorPreviews = useMemo(
    () =>
      popups
        .filter((item): item is AnchorPopupItem => item.type === "anchor")
        .sort((a, b) => a.payload.depth - b.payload.depth),
    [popups],
  );

  const treePopupItems = useMemo(
    () => popups.filter((item): item is TreePopupItem => item.type === "tree"),
    [popups],
  );

  const idPopup = useMemo(
    () => popups.find((item): item is IdPopupItem => item.type === "id"),
    [popups],
  );

  const contextMenuItems = useMemo(
    () => popups.filter((item): item is ContextMenuPopupItem => item.type === "contextMenu"),
    [popups],
  );

  const hasAnchorPreviews = anchorPreviews.length > 0;
  const hasPopupChild = useCallback(
    (popupId: string) => popups.some((item) => item.parentId === popupId),
    [popups],
  );

  // 検索バーはURLバー右メニューからのみ開く。
  // （Ctrl+F割り当ては無効化して、ブラウザ/OS標準ショートカットを優先する）
  useEffect(() => {
    const handleOpenSearch = () => {
        setShowSearch(true);
    };
    window.addEventListener("thread-search-open", handleOpenSearch);
    return () => window.removeEventListener("thread-search-open", handleOpenSearch);
  }, [setShowSearch]);

  /**
   * viewport座標（e.clientX/Y）を .thread-page 内の absolute 座標に変換する。
   * position:absolute を使ってポップアップをスクロール連動させるために必要。
   * getBoundingClientRect().top はスクロール量を反映した viewport 上の位置を返すため、
   * scrollTop を別途加算する必要はない。
   */
  const toPageCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (!rootRef.current) return { x: clientX, y: clientY };
      const rect = rootRef.current.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    [],
  );

  const clearAnchorPreviewHideTimer = useCallback(() => {
    if (anchorPreviewHideTimerRef.current != null) {
      window.clearTimeout(anchorPreviewHideTimerRef.current);
      anchorPreviewHideTimerRef.current = null;
    }
  }, []);

  const addTreePopup = useCallback(
    (
      resNum: number,
      e: React.MouseEvent,
      parentId?: string,
      anchorPreviewDepth = 0,
    ) => {
      const { x, y } = toPageCoords(e.clientX, e.clientY);
      addPopup({
        type: "tree",
        x,
        y,
        payload: { resNum, anchorPreviewDepth },
        parentId,
      });
    },
    [addPopup, toPageCoords],
  );

  const hideAnchorPreviewsFromDepth = useCallback(
    (depth: number) => {
      closePopupsByPredicate(
        (item) => item.type === "anchor" && item.payload.depth >= depth,
      );
    },
    [closePopupsByPredicate],
  );

  const hideAnchorPreviewImmediately = useCallback(
    (fromDepth = 0) => {
      clearAnchorPreviewHideTimer();
      hideAnchorPreviewsFromDepth(fromDepth);
    },
    [clearAnchorPreviewHideTimer, hideAnchorPreviewsFromDepth],
  );

  const hideAnchorPreview = useCallback(
    (fromDepth = 0) => {
      clearAnchorPreviewHideTimer();
      anchorPreviewHideTimerRef.current = window.setTimeout(() => {
        anchorPreviewHideTimerRef.current = null;
        hideAnchorPreviewsFromDepth(fromDepth);
      }, ANCHOR_PREVIEW_HIDE_DELAY_MS);
    },
    [clearAnchorPreviewHideTimer, hideAnchorPreviewsFromDepth],
  );

  const showAnchorPreview = useCallback(
    (
      targets: number[],
      anchorRect: DOMRect,
      label: string,
      depth: number,
    ) => {
      clearAnchorPreviewHideTimer();
      const items = targets
        .map((num) => indexes.resMap.get(num))
        .filter((res): res is IRes => !!res);
      if (items.length === 0) {
        hideAnchorPreviewsFromDepth(depth);
        return;
      }

      const maxWidth = Math.min(
        ANCHOR_PREVIEW_MAX_WIDTH,
        window.innerWidth - ANCHOR_PREVIEW_GUTTER * 2,
      );
      const vx = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.left,
          window.innerWidth - maxWidth - ANCHOR_PREVIEW_GUTTER,
        ),
      );
      const vy = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.bottom + ANCHOR_PREVIEW_OFFSET,
          window.innerHeight - ANCHOR_PREVIEW_GUTTER,
        ),
      );
      const { x, y } = toPageCoords(vx, vy);
      const parentId = depth > 0 ? anchorPreviews[depth - 1]?.id : undefined;
      hideAnchorPreviewsFromDepth(depth);
      addPopup({
        type: "anchor",
        x,
        y,
        payload: { items, label, depth },
        parentId,
      });
    },
    [addPopup, anchorPreviews, hideAnchorPreviewsFromDepth, indexes.resMap, toPageCoords],
  );

  const addPopupContextMenu = useCallback(
    (
      clientX: number,
      clientY: number,
      items: ContextMenuItem[],
      parentId?: string,
    ) => {
      closePopupsByPredicate((item) => item.type === "contextMenu");
      const { x, y } = toPageCoords(clientX, clientY);
      addPopup({
        type: "contextMenu",
        x,
        y,
        payload: { items },
        parentId,
      });
    },
    [addPopup, closePopupsByPredicate, toPageCoords],
  );

  const resolveAbsoluteUrl = useCallback(
    (rawUrl: string): string => {
      try {
        return new window.URL(rawUrl, page.threadUrl).href;
      } catch {
        return rawUrl;
      }
    },
    [page.threadUrl],
  );

  const parseInternalPage = useCallback((absoluteUrl: string) => {
    try {
      const url = new window.URL(absoluteUrl);
      const path = url.pathname;

      const is5chThread = /^\/test\/read\.cgi\/[^/]+\/\d+\/?/.test(path);
      const isJbbsThread = /^\/bbs\/read\.cgi\/[^/]+\/[^/]+\/\d+\/?/.test(path);
      const isMachiThread = /^\/bbs\/read\.cgi\/[^/]+\/\d+\/?/.test(path);

      if (is5chThread || isJbbsThread || isMachiThread) {
        return {
          type: "thread" as const,
          title: absoluteUrl,
          threadUrl: absoluteUrl,
        };
      }

      const is5chBoard = /^\/[^/]+\/$/.test(path);
      const isJbbsBoard = /^\/bbs\/read\.cgi\/[^/]+\/[^/]+\/$/.test(path);
      if (is5chBoard || isJbbsBoard) {
        return {
          type: "threadList" as const,
          title: absoluteUrl,
          boardUrl: absoluteUrl,
          boardTitle: absoluteUrl,
        };
      }
    } catch {
      return null;
    }
    return null;
  }, []);

  const openResolvedUrl = useCallback(
    (absoluteUrl: string, button: 0 | 1, resImages?: string[]) => {
      const internalPage = parseInternalPage(absoluteUrl);
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
    [dispatch, openMediaFromUrl, parseInternalPage],
  );

  const handleUrlClick = useCallback(
    (rawUrl: string, resImages?: string[], button: 0 | 1 = 0) => {
      const absoluteUrl = resolveAbsoluteUrl(rawUrl);
      openResolvedUrl(absoluteUrl, button, resImages);
    },
    [openResolvedUrl, resolveAbsoluteUrl],
  );

  const buildUrlContextMenuItems = useCallback(
    (rawUrl: string): ContextMenuItem[] => {
      const absoluteUrl = resolveAbsoluteUrl(rawUrl);
      const internalPage = parseInternalPage(absoluteUrl);

      return [
        {
          id: "open-in-current",
          label: internalPage ? "拡張内で開く" : "開く",
          onSelect: () => openResolvedUrl(absoluteUrl, 0),
        },
        {
          id: "open-in-new-tab",
          label: internalPage ? "拡張内の新しいタブで開く" : "新しいタブで開く",
          onSelect: () => openResolvedUrl(absoluteUrl, 1),
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
    [openResolvedUrl, parseInternalPage, resolveAbsoluteUrl],
  );

  const handleUrlContextMenu = useCallback(
    (rawUrl: string, e: React.MouseEvent, parentId?: string) => {
      addPopupContextMenu(
        e.clientX,
        e.clientY,
        buildUrlContextMenuItems(rawUrl),
        parentId,
      );
    },
    [addPopupContextMenu, buildUrlContextMenuItems],
  );

  // IDクリック → そのIDの全レスをポップアップ表示
  const handleIdClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      const resNums = indexes.idIndex.get(id);
      if (!resNums) return;
      hideAnchorPreviewImmediately();
      const items = Array.from(resNums)
        .sort((a, b) => a - b)
        .map((num) => indexes.resMap.get(num))
        .filter((r): r is IRes => !!r);
      const { x, y } = toPageCoords(e.clientX, e.clientY);
      closeNonContextPopups();
      addPopup({
        type: "id",
        x,
        y,
        payload: { items, title: `ID:${id} (${items.length}件)` },
      });
    },
    [indexes, toPageCoords, hideAnchorPreviewImmediately, closeNonContextPopups, addPopup],
  );

  // 返信クリック → 返信ツリーをポップアップ表示（スレッド本文から）
  const handleRepClick = useCallback(
    (resNum: number, e: React.MouseEvent) => {
      hideAnchorPreviewImmediately();
      closeNonContextPopups();
      addTreePopup(resNum, e);
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
        addTreePopup(resNum, e, parentId, anchorPreviewDepth);
      },
    [addTreePopup, clearAnchorPreviewHideTimer],
  );

  useEffect(() => {
    return () => {
      if (anchorPreviewHideTimerRef.current != null) {
        window.clearTimeout(anchorPreviewHideTimerRef.current);
      }
    };
  }, []);

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
      hideAnchorPreviewImmediately();
      const target = host.querySelector(`[data-res-num="${resNum}"]`);
      if (!target) return;
      const scrollContainer = host.closest(".content-area");
      if (
        scrollContainer instanceof HTMLElement &&
        target instanceof HTMLElement
      ) {
        // ThreadPageでは content-area が実スクロールコンテナなので、そこへ直接位置合わせする。
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
    [hideAnchorPreviewImmediately],
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
            const copyBody = `${page.title}\n${page.threadUrl}${targetRes.num}\n${targetRes.num} ${plainName}  ${targetRes.date ?? targetRes.other ?? ""}\n${plainMessage}`;
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
    (parentId: string) => (rawUrl: string, e: React.MouseEvent) => {
      handleUrlContextMenu(rawUrl, e, parentId);
    },
    [handleUrlContextMenu],
  );

  // ジェスチャーuseEffectでrootRefが確実にマウント済みになるよう、loading中の早期returnを廃止し常にrootRef付きdivを描画する
  return (
    <div ref={rootRef} className="thread-page">
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
                  className={`thread-page__filter-btn${filter === key ? " thread-page__filter-btn--active" : ""}`}
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
                  onContextMenu={(e) => openResContextMenu(res, e, false)}
                />
              );
            })}
          </div>

          <div className="thread-page__popup-layer">
            {anchorPreviews.map((anchorPreview) => (
              <AnchorPreview
                key={anchorPreview.id}
                depth={anchorPreview.payload.depth}
                x={anchorPreview.x}
                y={anchorPreview.y}
                items={anchorPreview.payload.items}
                label={anchorPreview.payload.label}
                messageProtocol={messageProtocol}
                repIndex={indexes.repIndex}
                onUrlClick={handleUrlClick}
                onUrlContextMenu={openPopupUrlContextMenu(anchorPreview.id)}
                onRepClick={handleRepClickInPopup(
                  anchorPreview.id,
                  anchorPreview.payload.depth + 1,
                )}
                onAnchorClick={handleAnchorClick}
                onAnchorHover={showAnchorPreview}
                onAnchorLeave={hideAnchorPreview}
                onMouseEnter={clearAnchorPreviewHideTimer}
                onMouseLeave={() => hideAnchorPreview(anchorPreview.payload.depth)}
                onResContextMenu={openPopupResContextMenu(anchorPreview.id)}
                hasChildPopup={hasPopupChild(anchorPreview.id)}
                zIndex={anchorPreview.z}
              />
            ))}

            {/* IDポップアップ */}
            {idPopup && (
              <ResPopup
                x={idPopup.x}
                y={idPopup.y}
                title={idPopup.payload.title}
                items={idPopup.payload.items}
                messageProtocol={messageProtocol}
                repIndex={indexes.repIndex}
                onUrlClick={handleUrlClick}
                onUrlContextMenu={openPopupUrlContextMenu(idPopup.id)}
                onRepClick={handleRepClickInPopup(idPopup.id)}
                onAnchorClick={handleAnchorClick}
                onAnchorHover={showAnchorPreview}
                onAnchorLeave={hideAnchorPreview}
                onResContextMenu={openPopupResContextMenu(idPopup.id)}
                // 子ポップアップ（TreePopup / ContextMenu）やAnchorPreviewが開いている間は
                // mouseleave / outside click で閉じないようにする。
                disableOutsideClick={hasPopupChild(idPopup.id) || hasAnchorPreviews}
                zIndex={idPopup.z}
                onClose={() => closePopupById(idPopup.id)}
                onMouseEnter={clearAnchorPreviewHideTimer}
                onMouseLeave={() => hideAnchorPreview(0)}
              />
            )}

            {/* 返信ツリーポップアップスタック（親子関係を保ちつつ積み重ねる） */}
            {treePopupItems.map((tp, i) => (
              <ReplyTreePopup
                key={tp.id}
                x={tp.x}
                y={tp.y}
                resNum={tp.payload.resNum}
                repIndex={indexes.repIndex}
                resMap={indexes.resMap}
                messageProtocol={messageProtocol}
                anchorPreviewDepth={tp.payload.anchorPreviewDepth}
                onUrlClick={handleUrlClick}
                onUrlContextMenu={openPopupUrlContextMenu(tp.id)}
                onRepClick={handleRepClickInPopup(
                  tp.id,
                  tp.payload.anchorPreviewDepth,
                )}
                onAnchorClick={handleAnchorClick}
                onAnchorHover={showAnchorPreview}
                onAnchorLeave={hideAnchorPreview}
                onResContextMenu={openPopupResContextMenu(tp.id)}
                // 上位ポップアップ、子メニュー、AnchorPreviewが開いている間は閉じない。
                disableOutsideClick={
                  i < treePopupItems.length - 1 ||
                  hasAnchorPreviews ||
                  hasPopupChild(tp.id)
                }
                // 開いた順にカウントされたz-indexで「後から開いたものが前面」を保証する
                zIndex={tp.z}
                onClose={() => closePopupById(tp.id)}
                onMouseEnter={clearAnchorPreviewHideTimer}
                onMouseLeave={() => hideAnchorPreview(0)}
              />
            ))}

            {contextMenuItems.map((menu) => (
              <ContextMenu
                key={menu.id}
                x={menu.x}
                y={menu.y}
                items={menu.payload.items}
                onClose={() => closePopupById(menu.id)}
              />
            ))}
          </div>

          {viewer && (
            <div className="media-viewer" onClick={closeViewer}>
              <div
                className="media-viewer__chrome"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="media-viewer__toolbar">
                  <span className="media-viewer__label">{viewer.label}</span>
                  <div className="media-viewer__actions">
                    {viewer.images && viewer.images.length > 1 && (
                      <>
                        <button
                          className="media-viewer__btn"
                          onClick={() => navigateViewer(-1)}
                          title="前の画像"
                        >
                          ←
                        </button>
                        <span className="media-viewer__nav-pos">
                          {(viewer.currentIndex ?? 0) + 1}/
                          {viewer.images.length}
                        </span>
                        <button
                          className="media-viewer__btn"
                          onClick={() => navigateViewer(1)}
                          title="次の画像"
                        >
                          →
                        </button>
                      </>
                    )}
                    <button
                      className="media-viewer__btn"
                      onClick={() =>
                        setViewerScale((prev) =>
                          Math.max(0.25, +(prev - 0.25).toFixed(2)),
                        )
                      }
                      title="縮小"
                    >
                      -
                    </button>
                    <button
                      className="media-viewer__btn"
                      onClick={() => setViewerScale(1)}
                      title="等倍"
                    >
                      100%
                    </button>
                    <button
                      className="media-viewer__btn"
                      onClick={() =>
                        setViewerScale((prev) =>
                          Math.min(5, +(prev + 0.25).toFixed(2)),
                        )
                      }
                      title="拡大"
                    >
                      +
                    </button>
                    <button
                      className="media-viewer__btn"
                      onClick={closeViewer}
                      title="閉じる"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div
                  ref={viewerStageRef}
                  className="media-viewer__stage"
                >
                  <img
                    className="media-viewer__image"
                    src={viewer.src}
                    alt={viewer.label}
                    style={{ transform: `scale(${viewerScale})` }}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
