import { Ban, Copy, Globe, History, Reply, Search, Type } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { container } from "src/service-container/index";
import type { IRes, IThreadDetail } from "src/service-container/interfaces";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import {
  ANCHOR_PREVIEW_GUTTER,
  ANCHOR_PREVIEW_HIDE_DELAY_MS,
  ANCHOR_PREVIEW_MAX_WIDTH,
  ANCHOR_PREVIEW_OFFSET,
} from "./constants";
import { PopupResCard } from "./PopupResCard";
import { ReplyTreePopup } from "./ReplyTreePopup";
import { ResItem } from "./ResItem";
import { ResPopup } from "./ResPopup";
import { buildIndexes } from "./thread-index";
import {
  AnchorPreviewState,
  PopupState,
  Props,
  ResContextMenuState,
  ThreadFilter,
  TreePopupState,
  ViewerState,
} from "./types";
import {
  buildKyodemoUrl,
  copyText,
  GestureDirection,
  GesturePoint,
  GESTURE_CONTEXTMENU_SUPPRESS_MS,
  GESTURE_START_THRESHOLD,
  hasExternalLink,
  hasImage,
  hasVideo,
  stripHtml,
  summarizeVerticalGesture,
  toViewerImageUrl,
} from "./utils";

export const ThreadPage: React.FC<Props> = ({ page }) => {
  const { dispatch } = useTabStore();
  const [responses, setResponses] = useState<IRes[]>([]);
  const [, setThreadTitle] = useState(page.title);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  // タイトル更新済みかを追跡するref
  const titleUpdatedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // UI状態
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [treePopup, setTreePopup] = useState<TreePopupState | null>(null);
  const [resContextMenu, setResContextMenu] =
    useState<ResContextMenuState | null>(null);
  const [miniAaResNums, setMiniAaResNums] = useState<Set<number>>(new Set());
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [viewerScale, setViewerScale] = useState(1);
  const [anchorPreviews, setAnchorPreviews] = useState<AnchorPreviewState[]>(
    [],
  );
  const anchorPreviewHideTimerRef = useRef<number | null>(null);
  const messageProtocol = useMemo(() => {
    // 拡張ページのprotocolを使うと //example.com/... が拡張URL扱いになるため、元スレURLのprotocolで本文を復元する。
    try {
      return new window.URL(page.threadUrl).protocol;
    } catch {
      return "https:";
    }
  }, [page.threadUrl]);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    titleUpdatedRef.current = false;
    try {
      // container経由でThreadサービスにアクセス
      const result = await container.thread.getThread(page.threadUrl, {
        forceUpdate: false,
        onCache: (cached: IThreadDetail) => {
          // キャッシュデータがあれば先に表示
          if (cached.res) {
            setResponses(cached.res);
          }
          if (cached.title && !titleUpdatedRef.current) {
            setThreadTitle(cached.title);
            dispatch({ type: "UPDATE_TITLE", title: cached.title });
            titleUpdatedRef.current = true;
          }
          setLoading(false);
        },
      });

      setResponses(result.res);
      setExpired(result.expired ?? false);
      if (result.title && !titleUpdatedRef.current) {
        setThreadTitle(result.title);
        dispatch({ type: "UPDATE_TITLE", title: result.title });
      }
      if (result.message) {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "スレッドの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [page.threadUrl, dispatch]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  // レスからID/返信/アンカーのインデックスを構築
  const indexes = useMemo(() => buildIndexes(responses), [responses]);

  // Ctrl+Fで検索バーを開く
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // フィルタ & 検索適用
  const filteredResponses = useMemo(() => {
    let list = responses;

    if (filter !== "all") {
      list = list.filter((res) => {
        switch (filter) {
          case "popular":
            return (indexes.repIndex.get(res.num)?.size ?? 0) >= 3;
          case "image":
            return hasImage(res.message);
          case "video":
            return hasVideo(res.message);
          case "link":
            return hasExternalLink(res.message);
        }
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((res) => {
        const text = stripHtml(res.message).toLowerCase();
        const name = stripHtml(res.name).toLowerCase();
        return (
          text.includes(q) ||
          name.includes(q) ||
          (res.id?.toLowerCase().includes(q) ?? false)
        );
      });
    }

    return list;
  }, [responses, filter, searchQuery, indexes.repIndex]);

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
      setPopup({
        x: e.clientX,
        y: e.clientY,
        items,
        title: `ID:${id} (${items.length}件)`,
      });
      setTreePopup(null);
    },
    [indexes],
  );

  // 返信クリック → 返信ツリーをポップアップ表示
  const handleRepClick = useCallback((resNum: number, e: React.MouseEvent) => {
    hideAnchorPreviewImmediately();
    setTreePopup({ x: e.clientX, y: e.clientY, resNum });
    setPopup(null);
  }, []);

  const closePopup = useCallback(() => {
    hideAnchorPreviewImmediately();
    setPopup(null);
    setTreePopup(null);
  }, []);

  const closeResContextMenu = useCallback(() => {
    setResContextMenu(null);
  }, []);

  const openMediaFromUrl = useCallback((url: string) => {
    const imageUrl = toViewerImageUrl(url);
    if (imageUrl) {
      setViewer({ src: imageUrl, label: url });
      setViewerScale(1);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const closeViewer = useCallback(() => {
    setViewer(null);
  }, []);

  const clearAnchorPreviewHideTimer = useCallback(() => {
    if (anchorPreviewHideTimerRef.current != null) {
      window.clearTimeout(anchorPreviewHideTimerRef.current);
      anchorPreviewHideTimerRef.current = null;
    }
  }, []);

  const hideAnchorPreviewImmediately = useCallback(
    (fromDepth = 0) => {
      clearAnchorPreviewHideTimer();
      setAnchorPreviews((prev) => prev.slice(0, fromDepth));
    },
    [clearAnchorPreviewHideTimer],
  );

  const hideAnchorPreview = useCallback(
    (fromDepth = 0) => {
      clearAnchorPreviewHideTimer();
      // 親子プレビュー間を横断する間は少し猶予を持たせ、子プレビューに入ったら閉じを打ち消す。
      anchorPreviewHideTimerRef.current = window.setTimeout(() => {
        anchorPreviewHideTimerRef.current = null;
        setAnchorPreviews((prev) => prev.slice(0, fromDepth));
      }, ANCHOR_PREVIEW_HIDE_DELAY_MS);
    },
    [clearAnchorPreviewHideTimer],
  );

  const showAnchorPreview = useCallback(
    (targets: number[], anchorRect: DOMRect, label: string, depth: number) => {
      clearAnchorPreviewHideTimer();
      if (targets.length === 0) {
        setAnchorPreviews((prev) => prev.slice(0, depth));
        return;
      }
      const items = targets
        .map((num) => indexes.resMap.get(num))
        .filter((res): res is IRes => !!res);
      if (items.length === 0) {
        setAnchorPreviews((prev) => prev.slice(0, depth));
        return;
      }
      const maxWidth = Math.min(
        ANCHOR_PREVIEW_MAX_WIDTH,
        window.innerWidth - ANCHOR_PREVIEW_GUTTER * 2,
      );
      const x = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.left,
          window.innerWidth - maxWidth - ANCHOR_PREVIEW_GUTTER,
        ),
      );
      const y = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.bottom + ANCHOR_PREVIEW_OFFSET,
          window.innerHeight - ANCHOR_PREVIEW_GUTTER,
        ),
      );
      // 旧PopupViewと同様に深さごとのスタックで保持し、子プレビュー表示中も親を残す。
      setAnchorPreviews((prev) => {
        const next = prev.slice(0, depth);
        next.push({ depth, x, y, items, label });
        return next;
      });
    },
    [clearAnchorPreviewHideTimer, indexes.resMap],
  );

  useEffect(() => {
    return () => {
      if (anchorPreviewHideTimerRef.current != null) {
        window.clearTimeout(anchorPreviewHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!viewer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeViewer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeViewer, viewer]);

  useEffect(() => {
    const host = rootRef.current;
    if (!host) return;

    // React版では content-area が実際のスクロールコンテナなので、旧ジェスチャーの移動先もそこへ合わせる。
    const scrollContainer = host.closest(".content-area");
    if (!(scrollContainer instanceof HTMLElement)) {
      return;
    }

    let points: GesturePoint[] = [];
    let isDrawing = false;
    let gestureCandidate = false;
    let gestureJustCompleted = false;
    let detectedGesture: GestureDirection | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let context: CanvasRenderingContext2D | null = null;
    let label: HTMLDivElement | null = null;
    let suppressTimerId: number | null = null;

    const isWithinHost = (target: EventTarget | null): boolean => {
      return target instanceof Node && host.contains(target);
    };

    const clearSuppressTimer = (): void => {
      if (suppressTimerId != null) {
        window.clearTimeout(suppressTimerId);
        suppressTimerId = null;
      }
    };

    const resizeCanvas = (): void => {
      if (!canvas) {
        return;
      }
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const ensureOverlay = (): void => {
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.style.position = "fixed";
        canvas.style.top = "0";
        canvas.style.left = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.zIndex = "99999";
        canvas.style.pointerEvents = "none";
        document.body.appendChild(canvas);
        context = canvas.getContext("2d");
        resizeCanvas();
      }

      if (!label) {
        label = document.createElement("div");
        label.style.position = "fixed";
        label.style.top = "50%";
        label.style.left = "50%";
        label.style.transform = "translate(-50%, -50%)";
        label.style.fontSize = "64px";
        label.style.fontWeight = "bold";
        label.style.color = "rgba(0, 123, 255, 0.8)";
        label.style.pointerEvents = "none";
        label.style.zIndex = "100000";
        label.style.textShadow =
          "2px 2px 0 #fff, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff";
        label.style.fontFamily = "sans-serif";
        document.body.appendChild(label);
      }

      if (!context) {
        return;
      }

      canvas.style.display = "block";
      label.style.display = "block";
      label.textContent = "";
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.beginPath();
      context.strokeStyle = "rgba(0, 123, 255, 0.8)";
      context.lineWidth = 4;
      context.lineCap = "round";
      context.lineJoin = "round";
    };

    const stopDrawing = (): void => {
      isDrawing = false;
      gestureCandidate = false;
      points = [];
      detectedGesture = null;
      if (canvas) {
        canvas.style.display = "none";
      }
      if (label) {
        label.style.display = "none";
        label.textContent = "";
      }
    };

    const drawLine = (x: number, y: number): void => {
      if (!context) {
        return;
      }
      context.lineTo(x, y);
      context.stroke();
    };

    const handleMouseDown = (e: MouseEvent): void => {
      if (e.button !== 2 || !isWithinHost(e.target)) {
        return;
      }

      gestureCandidate = true;
      isDrawing = false;
      points = [{ x: e.clientX, y: e.clientY }];
      detectedGesture = null;
    };

    const handleMouseMove = (e: MouseEvent): void => {
      if (!gestureCandidate) {
        return;
      }

      points.push({ x: e.clientX, y: e.clientY });

      if (!isDrawing) {
        const start = points[0];
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) < GESTURE_START_THRESHOLD) {
          return;
        }

        ensureOverlay();
        if (!context) {
          return;
        }
        context.moveTo(start.x, start.y);
        isDrawing = true;
      }

      drawLine(e.clientX, e.clientY);

      if (detectedGesture || points.length <= 2 || !label) {
        return;
      }

      const summary = summarizeVerticalGesture(points);
      if (!summary) {
        return;
      }

      detectedGesture = summary.direction;
      label.textContent = summary.direction === "Up" ? "▲ Top" : "▼ Bottom";
    };

    const handleMouseUp = (e: MouseEvent): void => {
      if (e.button !== 2 || !gestureCandidate) {
        return;
      }

      if (!isDrawing) {
        gestureCandidate = false;
        points = [];
        detectedGesture = null;
        return;
      }

      const completedGesture = detectedGesture;
      stopDrawing();
      gestureJustCompleted = true;
      clearSuppressTimer();
      suppressTimerId = window.setTimeout(() => {
        gestureJustCompleted = false;
        suppressTimerId = null;
      }, GESTURE_CONTEXTMENU_SUPPRESS_MS);

      if (completedGesture === "Up") {
        scrollContainer.scrollTop = 0;
      } else if (completedGesture === "Down") {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    };

    const handleContextMenu = (e: MouseEvent): void => {
      const targetWithinHost = isWithinHost(e.target);

      if (isDrawing || gestureJustCompleted) {
        if (targetWithinHost || gestureJustCompleted) {
          e.preventDefault();
          e.stopPropagation();
          stopDrawing();
          gestureJustCompleted = false;
          clearSuppressTimer();
        }
        return;
      }

      if (gestureCandidate && targetWithinHost) {
        gestureCandidate = false;
        points = [];
        detectedGesture = null;
      }
    };

    const handleWindowBlur = (): void => {
      stopDrawing();
      gestureJustCompleted = false;
      clearSuppressTimer();
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("mouseup", handleMouseUp, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("blur", handleWindowBlur);
      clearSuppressTimer();
      if (canvas) {
        canvas.remove();
      }
      if (label) {
        label.remove();
      }
    };
  }, []);

  const addIdToNg = useCallback(async (id: string | undefined) => {
    if (!id) return;
    const ngWord = id.startsWith("ID:") ? id : `ID:${id}`;
    // 既存実装の「ID/IPをNG指定」と同じくNGサービスへ直接追加
    container.ng.add(ngWord);
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

  // 各レスのID内通し番号を事前計算
  const idPositions = useMemo(() => {
    const positions = new Map<number, number>();
    const counters = new Map<string, number>();
    for (const res of responses) {
      if (res.id) {
        const count = (counters.get(res.id) ?? 0) + 1;
        counters.set(res.id, count);
        positions.set(res.num, count);
      }
    }
    return positions;
  }, [responses]);

  const responseContextItems = useMemo(() => {
    if (!resContextMenu) return [];
    const targetRes = resContextMenu.res;
    const plainName = stripHtml(targetRes.name);
    const plainMessage = stripHtml(targetRes.message);
    const rawId = targetRes.id ?? "";
    const kyodemoUrl = rawId ? buildKyodemoUrl(page.threadUrl, rawId) : null;
    const permalink = `${page.threadUrl}${targetRes.num}`;
    const isMiniAa = miniAaResNums.has(targetRes.num);

    return [
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
  }, [
    addIdToNg,
    addWriteHistory,
    miniAaResNums,
    page.threadUrl,
    resContextMenu,
  ]);

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
                  onUrlClick={openMediaFromUrl}
                  onAnchorClick={handleAnchorClick}
                  onAnchorHover={showAnchorPreview}
                  onAnchorLeave={hideAnchorPreview}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    hideAnchorPreviewImmediately();
                    setResContextMenu({ x: e.clientX, y: e.clientY, res });
                  }}
                />
              );
            })}
          </div>

          {resContextMenu && (
            <ContextMenu
              x={resContextMenu.x}
              y={resContextMenu.y}
              items={responseContextItems}
              onClose={closeResContextMenu}
            />
          )}

          {!resContextMenu &&
            anchorPreviews.map((anchorPreview) => (
              <div
                key={`anchor-preview-${anchorPreview.depth}`}
                className="anchor-preview"
                style={{
                  left: anchorPreview.x,
                  top: anchorPreview.y,
                  zIndex: 10020 + anchorPreview.depth,
                }}
                onMouseEnter={clearAnchorPreviewHideTimer}
                onMouseLeave={() => hideAnchorPreview(anchorPreview.depth)}
              >
                <div className="anchor-preview__title">
                  参照: {anchorPreview.label}
                </div>
                <div className="anchor-preview__body">
                  {anchorPreview.items.slice(0, 8).map((res) => (
                    <PopupResCard
                      key={res.num}
                      res={res}
                      messageProtocol={messageProtocol}
                      anchorPreviewDepth={anchorPreview.depth + 1}
                      onUrlClick={openMediaFromUrl}
                      onAnchorClick={handleAnchorClick}
                      onAnchorHover={showAnchorPreview}
                      onAnchorLeave={hideAnchorPreview}
                      onContextMenu={(e, targetRes) => {
                        hideAnchorPreviewImmediately();
                        setResContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          res: targetRes,
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}

          {/* IDポップアップ */}
          {popup && (
            <ResPopup
              x={popup.x}
              y={popup.y}
              title={popup.title}
              items={popup.items}
              messageProtocol={messageProtocol}
              onUrlClick={openMediaFromUrl}
              onAnchorClick={handleAnchorClick}
              onAnchorHover={showAnchorPreview}
              onAnchorLeave={hideAnchorPreview}
              onResContextMenu={(e, targetRes) => {
                hideAnchorPreviewImmediately();
                setResContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  res: targetRes,
                });
              }}
              onClose={closePopup}
            />
          )}

          {/* 返信ツリーポップアップ */}
          {treePopup && (
            <ReplyTreePopup
              x={treePopup.x}
              y={treePopup.y}
              resNum={treePopup.resNum}
              repIndex={indexes.repIndex}
              resMap={indexes.resMap}
              messageProtocol={messageProtocol}
              onUrlClick={openMediaFromUrl}
              onAnchorClick={handleAnchorClick}
              onAnchorHover={showAnchorPreview}
              onAnchorLeave={hideAnchorPreview}
              onResContextMenu={(e, targetRes) => {
                hideAnchorPreviewImmediately();
                setResContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  res: targetRes,
                });
              }}
              onClose={closePopup}
            />
          )}

          {viewer && (
            <div className="media-viewer" onClick={closeViewer}>
              <div
                className="media-viewer__chrome"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="media-viewer__toolbar">
                  <span className="media-viewer__label">{viewer.label}</span>
                  <div className="media-viewer__actions">
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
                  className="media-viewer__stage"
                  onWheel={(e) => {
                    e.preventDefault();
                    setViewerScale((prev) => {
                      const next = e.deltaY < 0 ? prev + 0.15 : prev - 0.15;
                      return Math.min(5, Math.max(0.25, +next.toFixed(2)));
                    });
                  }}
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
