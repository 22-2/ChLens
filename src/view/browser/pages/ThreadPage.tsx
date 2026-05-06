import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getResNumber } from "src/core/URL";
import {
  add as addWriteHistoryRecord,
  getByUrl as getWriteHistoryByUrl,
} from "src/core/WriteHistory";
import { container } from "src/service-container/index";
import type {
  IReadState,
  IRes,
  IThread,
} from "src/service-container/interfaces";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
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
import { useThreadResContextMenu } from "src/view/browser/pages/thread/use-thread-res-context-menu";
import { useThreadTopBar } from "src/view/browser/pages/thread/use-thread-top-bar";
import {
  parseInternalBrowserPage,
  resolveAbsoluteUrl,
  RESPECT_DEFAULT_EXTERNAL,
} from "src/view/browser/utils/link-routing";
import { resolveReplyTreeRootResNum } from "src/view/browser/utils/reply-tree-root";
import {
  buildBlurredResSet,
  buildReplyToWrittenResSet,
  buildWrittenResSet,
  compileImageBlurPattern,
  resolveImageBlurRadius,
} from "src/view/browser/utils/thread-emphasis";
import {
  consumePendingThreadResJump,
  findThreadScrollContainer,
  measureThreadReadState,
  peekPendingThreadResJump,
  requestThreadResJump,
  scrollThreadToResponse,
  subscribeThreadResJump,
  type PendingThreadJump,
} from "src/view/browser/utils/thread-read-state";
import {
  findLatestWrittenRes,
  resolveWrittenResTimestamp,
  subscribeThreadWriteCompleted,
  type PendingWritePayload,
} from "src/view/browser/utils/thread-write-sync";
import type { Props } from "src/view/browser/utils/types";
import { copyText, stripHtml } from "src/view/browser/utils/utils";

interface ImageBlurConfigState {
  enabled: boolean;
  radius: number;
  harmfulWordPattern: RegExp | null;
}

interface PendingWriteMatchState extends PendingWritePayload {
  baselineResponseCount: number;
  baselineLastResNum: number | null;
}

const IMAGE_BLUR_CONFIG_KEYS = new Set([
  "image_blur",
  "image_blur_length",
  "image_blur_word",
]);

function readImageBlurConfig(): ImageBlurConfigState {
  const enabled = container.config.get("image_blur") === "on";
  const radius = resolveImageBlurRadius(
    container.config.get("image_blur_length"),
  );
  const rawPattern = container.config.get("image_blur_word");
  const harmfulWordPattern =
    typeof rawPattern === "string" ? compileImageBlurPattern(rawPattern) : null;

  return {
    enabled,
    radius,
    harmfulWordPattern,
  };
}

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
  const [ownResNums, setOwnResNums] = useState<Set<number>>(new Set());
  const [pendingWrite, setPendingWrite] =
    useState<PendingWriteMatchState | null>(null);
  const [imageBlurConfig, setImageBlurConfig] =
    useState<ImageBlurConfigState>(readImageBlurConfig);
  const [initialReadState, setInitialReadState] = useState<IReadState | null>(
    null,
  );
  const [hasLoadedInitialReadState, setHasLoadedInitialReadState] =
    useState(false);
  const [isInitialReadStateResolved, setIsInitialReadStateResolved] =
    useState(false);
  const [pendingThreadJump, setPendingThreadJump] =
    useState<PendingThreadJump | null>(null);
  const responseCountRef = useRef(0);
  const lastResponseNumRef = useRef<number | null>(null);
  const latestReadStateRef = useRef<IReadState | null>(null);
  const saveReadStateTimerRef = useRef<number | null>(null);

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
    followThread: handleFollowNextThread,
  });
  const threadNgCount = useMemo(
    () =>
      responses.filter((res) => res.ng != null || res.class?.includes("ng"))
        .length,
    [responses],
  );
  const replyToOwnResNums = useMemo(
    () => buildReplyToWrittenResSet(ownResNums, indexes.repIndex),
    [indexes.repIndex, ownResNums],
  );
  const ownHighlightCount = useMemo(() => {
    const highlightedResNums = new Set<number>(ownResNums);
    for (const resNum of replyToOwnResNums) {
      highlightedResNums.add(resNum);
    }
    return highlightedResNums.size;
  }, [ownResNums, replyToOwnResNums]);
  const blurredResNums = useMemo(() => {
    if (!imageBlurConfig.enabled) {
      return new Set<number>();
    }

    return buildBlurredResSet(
      responses,
      indexes.repIndex,
      imageBlurConfig.harmfulWordPattern,
    );
  }, [imageBlurConfig, indexes.repIndex, responses]);

  useEffect(() => {
    responseCountRef.current = responses.length;
    lastResponseNumRef.current = responses.at(-1)?.num ?? null;
  }, [responses]);

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

  useEffect(() => {
    let alive = true;

    const loadOwnResNums = async () => {
      try {
        const rows = await getWriteHistoryByUrl(page.threadUrl);
        if (!alive) {
          return;
        }
        setOwnResNums(buildWrittenResSet(rows));
      } catch {
        if (alive) {
          setOwnResNums(new Set());
        }
      }
    };

    void loadOwnResNums();

    return () => {
      alive = false;
    };
  }, [page.threadUrl]);

  useEffect(() => {
    setPendingWrite(null);
  }, [page.threadUrl]);

  useEffect(() => {
    const handleThreadWriteCompleted = (payload: PendingWritePayload) => {
      if (payload.threadUrl !== page.threadUrl) {
        return;
      }

      // 変更理由: 送信前時点の末尾レス位置を覚えておくと、同文レスが既にあるスレでも
      // 新着到着前の古いレスを誤って「今書いたレス」と認定する事故を避けられる。
      setPendingWrite({
        ...payload,
        baselineResponseCount: responseCountRef.current,
        baselineLastResNum: lastResponseNumRef.current,
      });
    };

    return subscribeThreadWriteCompleted(handleThreadWriteCompleted);
  }, [page.threadUrl]);

  useEffect(() => {
    if (!pendingWrite || responses.length === 0) {
      return;
    }

    const currentLastResNum = responses.at(-1)?.num ?? null;
    const hasAdvancedSinceSubmit =
      responses.length > pendingWrite.baselineResponseCount ||
      (pendingWrite.baselineLastResNum != null &&
        currentLastResNum != null &&
        currentLastResNum > pendingWrite.baselineLastResNum);
    if (!hasAdvancedSinceSubmit) {
      return;
    }

    const matchedRes = findLatestWrittenRes(
      responses,
      pendingWrite.message,
      ownResNums,
    );
    if (!matchedRes) {
      return;
    }

    setPendingWrite(null);

    let alive = true;
    void (async () => {
      if (container.config.get("no_writehistory") !== "on") {
        try {
          await addWriteHistoryRecord({
            url: page.threadUrl,
            res: matchedRes.num,
            title: page.title,
            name: stripHtml(matchedRes.name),
            mail: matchedRes.mail,
            inputName: pendingWrite.inputName,
            inputMail: pendingWrite.inputMail,
            message: pendingWrite.message,
            date: resolveWrittenResTimestamp(matchedRes),
          });
        } catch {
          // 書込履歴の永続化に失敗しても、画面上の自分レス強調までは失わない。
        }
      }

      if (!alive) {
        return;
      }

      // 変更理由: 投稿直後のレス番号が確定した瞬間に ownResNums へ反映し、
      // 書込履歴の再読込を待たずに自分レス強調をその場で見せる。
      setOwnResNums((prev) => {
        if (prev.has(matchedRes.num)) {
          return prev;
        }

        const next = new Set(prev);
        next.add(matchedRes.num);
        return next;
      });
    })();

    return () => {
      alive = false;
    };
  }, [ownResNums, page.threadUrl, page.title, pendingWrite, responses]);

  useEffect(() => {
    const applyImageBlurConfig = () => {
      setImageBlurConfig(readImageBlurConfig());
    };

    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (!key || IMAGE_BLUR_CONFIG_KEYS.has(key)) {
        applyImageBlurConfig();
      }
    };

    container.config.ready(applyImageBlurConfig);
    container.message.on("config_updated", handleConfigUpdated);

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  const scrollToResponse = useCallback(
    (resNum: number, options?: { highlight?: boolean; offset?: number }) =>
      scrollThreadToResponse(rootRef.current, resNum, options),
    [],
  );

  const saveCurrentReadState = useCallback(async () => {
    if (!isActive || !isInitialReadStateResolved) {
      return;
    }

    const measuredReadState = measureThreadReadState(
      rootRef.current,
      responses.length,
    );
    if (!measuredReadState) {
      return;
    }

    const previousReadState = latestReadStateRef.current;
    const nextReadState: IReadState = {
      url: page.threadUrl,
      last: measuredReadState.last,
      read: Math.max(previousReadState?.read ?? 0, measuredReadState.read),
      received: Math.max(
        previousReadState?.received ?? 0,
        measuredReadState.received,
      ),
      offset: measuredReadState.offset,
      date: Date.now(),
    };

    if (
      previousReadState &&
      previousReadState.last === nextReadState.last &&
      previousReadState.read === nextReadState.read &&
      previousReadState.received === nextReadState.received &&
      (previousReadState.offset ?? null) === (nextReadState.offset ?? null)
    ) {
      return;
    }

    latestReadStateRef.current = nextReadState;
    try {
      await container.readState.set(nextReadState);
    } catch (error) {
      console.error(error);
    }
  }, [isActive, isInitialReadStateResolved, page.threadUrl, responses.length]);

  const scheduleReadStateSave = useCallback(() => {
    if (saveReadStateTimerRef.current != null) {
      window.clearTimeout(saveReadStateTimerRef.current);
    }

    saveReadStateTimerRef.current = window.setTimeout(() => {
      saveReadStateTimerRef.current = null;
      void saveCurrentReadState();
    });
  }, [saveCurrentReadState]);

  useEffect(() => {
    let cancelled = false;

    setInitialReadState(null);
    setHasLoadedInitialReadState(false);
    setIsInitialReadStateResolved(false);
    setPendingThreadJump(peekPendingThreadResJump(page.threadUrl));
    latestReadStateRef.current = null;

    const loadInitialThreadReadState = async () => {
      let nextReadState =
        container.bookmark.get(page.threadUrl)?.readState ?? null;

      try {
        const storedReadState = await container.readState.get(page.threadUrl);
        if (
          storedReadState &&
          (!nextReadState ||
            container.util.isNewerReadState(nextReadState, storedReadState))
        ) {
          nextReadState = storedReadState;
        }
      } catch (error) {
        console.error(error);
      }

      if (cancelled) {
        return;
      }

      latestReadStateRef.current = nextReadState;
      setInitialReadState(nextReadState);
      setHasLoadedInitialReadState(true);
    };

    void loadInitialThreadReadState();

    return () => {
      cancelled = true;
    };
  }, [page.threadUrl]);

  useEffect(() => {
    return subscribeThreadResJump((jump) => {
      if (jump.threadUrl !== page.threadUrl) {
        return;
      }

      setPendingThreadJump(jump);
    });
  }, [page.threadUrl]);

  useEffect(() => {
    if (!isActive || !pendingThreadJump || responses.length === 0 || loading) {
      return;
    }

    scrollToResponse(pendingThreadJump.resNum);
    consumePendingThreadResJump(page.threadUrl, pendingThreadJump.token);
    setPendingThreadJump((current) =>
      current?.token === pendingThreadJump.token ? null : current,
    );
    setIsInitialReadStateResolved(true);

    window.requestAnimationFrame(() => {
      void saveCurrentReadState();
    });
  }, [
    isActive,
    loading,
    page.threadUrl,
    pendingThreadJump,
    responses.length,
    saveCurrentReadState,
    scrollToResponse,
  ]);

  useEffect(() => {
    if (
      !isActive ||
      isInitialReadStateResolved ||
      pendingThreadJump ||
      !hasLoadedInitialReadState ||
      responses.length === 0 ||
      loading
    ) {
      return;
    }

    if (initialReadState?.last) {
      scrollToResponse(initialReadState.last, {
        highlight: false,
        offset: initialReadState.offset,
      });
    }

    setIsInitialReadStateResolved(true);
    window.requestAnimationFrame(() => {
      void saveCurrentReadState();
    });
  }, [
    hasLoadedInitialReadState,
    initialReadState,
    isActive,
    isInitialReadStateResolved,
    loading,
    pendingThreadJump,
    responses.length,
    saveCurrentReadState,
    scrollToResponse,
  ]);

  useEffect(() => {
    if (!isActive || !isInitialReadStateResolved || responses.length === 0) {
      return;
    }

    const scrollContainer = findThreadScrollContainer(rootRef.current);
    if (!scrollContainer) {
      return;
    }

    const handleScroll = () => {
      scheduleReadStateSave();
    };

    scrollContainer.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (saveReadStateTimerRef.current != null) {
        window.clearTimeout(saveReadStateTimerRef.current);
        saveReadStateTimerRef.current = null;
      }
      void saveCurrentReadState();
    };
  }, [
    isActive,
    isInitialReadStateResolved,
    responses.length,
    saveCurrentReadState,
    scheduleReadStateSave,
  ]);

  useEffect(() => {
    if (
      !isActive ||
      !isInitialReadStateResolved ||
      loading ||
      responses.length === 0
    ) {
      return;
    }

    // 変更理由: 自動更新で received だけ増えたケースはスクロールイベントが発生しないため、
    // レス数変化時にも保存を予約して未読数の取りこぼしを防ぐ。
    scheduleReadStateSave();
  }, [
    isActive,
    isInitialReadStateResolved,
    loading,
    responses.length,
    scheduleReadStateSave,
  ]);

  useEffect(() => {
    const handlePageHide = () => {
      if (saveReadStateTimerRef.current != null) {
        window.clearTimeout(saveReadStateTimerRef.current);
        saveReadStateTimerRef.current = null;
      }
      void saveCurrentReadState();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [saveCurrentReadState]);

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
        if (internalPage.type === "thread") {
          const jumpResNum = Number.parseInt(
            getResNumber(absoluteUrl) ?? "",
            10,
          );
          if (Number.isFinite(jumpResNum) && jumpResNum > 0) {
            requestThreadResJump(internalPage.threadUrl, jumpResNum);
          }
        }

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
      // ポップアップ上のアンカークリックでも遷移先を確実に視認できるよう、
      // ジャンプ時はいったん非メニュー系ポップアップを閉じて本文へフォーカスを戻す。
      closeNonContextPopups();
      scrollToResponse(resNum);
    },
    [closeNonContextPopups, scrollToResponse],
  );

  // popup store の状態変化で ThreadPage が re-render されると、インラインアロー関数は
  // 毎回新しい参照を生成し、buildContextMenuItems → openThreadResContextMenu まで
  // 連鎖的に新参照になって ResItem が re-render される。
  // ResItem 内の dangerouslySetInnerHTML による innerHTML 置換でテキスト選択が消えるため、
  // useCallback で参照を安定化してその re-render を防ぐ。
  const handleWriteHistoryAdded = useCallback((resNum: number) => {
    setOwnResNums((prev) => {
      if (prev.has(resNum)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(resNum);
      return next;
    });
  }, []);

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
      onWriteHistoryAdded: handleWriteHistoryAdded,
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
      if (container.config.get("dblclick_reload") !== "on") {
        return;
      }

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
      if (window.getSelection()?.toString()) {
        return;
      }

      dispatch({ type: "RELOAD" });
    },
    [dispatch],
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

          {isActiveAutoRefreshEnabled && (
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
