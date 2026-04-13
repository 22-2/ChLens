import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { container } from "src/service-container/index";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import {
  Ban,
  Copy,
  Globe,
  History,
  Reply,
  Search,
  Type,
} from "lucide-react";
import MessageProcessor from "src/core/MessageProcessor.js";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import type { IRes, IThreadDetail } from "src/service-container/interfaces";

// --- アンカーパーサ ---
// MessageProcessor由来のHTML内のアンカー（>>N）から参照先レス番号を抽出する
const ANCHOR_REG =
  /(?:&gt;|＞){1,2}([\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?(?:\s*[,、]\s*[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?)*)/g;
const FW_NUM_REG = /[\uff10-\uff19]/g;

function parseAnchors(message: string): number[] {
  const targets: number[] = [];
  ANCHOR_REG.lastIndex = 0;
  let match;
  while ((match = ANCHOR_REG.exec(message)) !== null) {
    const raw = match[1].replace(FW_NUM_REG, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30)
    );
    const parts = raw.split(/\s*[,、]\s*/);
    for (const part of parts) {
      const range = part.split(/[\-\u30fc]/);
      const start = parseInt(range[0], 10);
      const end = range.length > 1 ? parseInt(range[1], 10) : start;
      // 25件以上の範囲指定は無視（既存動作に合わせる）
      if (isNaN(start) || isNaN(end) || end - start >= 25) continue;
      for (let i = start; i <= end; i++) {
        targets.push(i);
      }
    }
  }
  return targets;
}

// HTMLからテキストを抽出（検索フィルタ用）
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function buildKyodemoUrl(threadUrl: string, rawId: string): string | null {
  try {
    const urlObj = new window.URL(threadUrl);
    const pathParts = urlObj.pathname.split("/");
    const board = pathParts[3];
    const key = pathParts[4];
    if (!board || !key) return null;

    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}${mm}${dd}`;

    return `https://www.kyodemo.net/sdemo/b/e_e_${board}/?hi=${encodeURIComponent(rawId)}&key=${encodeURIComponent(key)}&date=${dateStr}`;
  } catch {
    return null;
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard APIが使えない環境向けフォールバック
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

// --- フィルタ判定 ---
function hasImage(message: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|avif)(?:\?[^"<]*)?(?=["<\s]|$)/i.test(
    message
  );
}

function hasVideo(message: string): boolean {
  return (
    /\.(mp4|webm|avi|mov)(?:\?[^"<]*)?(?=["<\s]|$)/i.test(message) ||
    /<video\b/i.test(message)
  );
}

function hasExternalLink(message: string): boolean {
  return /<a\b[^>]*href="https?:\/\/[^"]*"[^>]*>/i.test(message);
}

function parseAnchorDisplayTargets(text: string): number[] {
  const raw = text
    .replace(/&gt;/g, ">")
    .replace(/[＞]/g, ">")
    .replace(/^>+/, "")
    .trim();
  if (!raw) return [];

  const result = new Set<number>();
  const parts = raw.split(/\s*[,、]\s*/);
  for (const part of parts) {
    const range = part
      .replace(FW_NUM_REG, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
      .split(/[\-\u30fc]/);
    const start = parseInt(range[0], 10);
    const end = range.length > 1 ? parseInt(range[1], 10) : start;
    if (Number.isNaN(start) || Number.isNaN(end) || end - start >= 25) {
      continue;
    }
    for (let i = start; i <= end; i++) {
      result.add(i);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

interface DecodedMessageParts {
  nameHtml: string;
  mailHtml: string;
  otherHtml: string;
  messageHtml: string;
  isNameAnchor: boolean;
}

function decodeResponseHtml(
  res: IRes,
  protocol: string
): DecodedMessageParts {
  // React版でも旧ビューと同じHTML化を通しておかないと、>>アンカーが文字列のまま残ってホバー対象を拾えない。
  return MessageProcessor.decode(res, protocol) as DecodedMessageParts;
}

type GestureDirection = "Up" | "Down";

interface GesturePoint {
  x: number;
  y: number;
}

const GESTURE_START_THRESHOLD = 12;
const GESTURE_CONTEXTMENU_SUPPRESS_MS = 400;

function summarizeVerticalGesture(
  points: GesturePoint[]
): { direction: GestureDirection; distance: number } | null {
  if (points.length < 2) {
    return null;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const totalDx = end.x - start.x;
  const totalDy = end.y - start.y;
  const distance = Math.hypot(totalDx, totalDy);

  if (distance < 10) {
    return null;
  }

  if (Math.abs(totalDy) <= Math.abs(totalDx)) {
    return null;
  }

  return {
    direction: totalDy < 0 ? "Up" : "Down",
    distance,
  };
}

function extractUrlsFromMessage(message: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const pushUrl = (url: string) => {
    const trimmed = url.trim().replace(/[),.;]+$/, "");
    if (!/^https?:\/\//i.test(trimmed)) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(message, "text/html");
    for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
      pushUrl(a.getAttribute("href") ?? "");
    }
  } catch {
    // HTMLパースに失敗した場合でも正規表現抽出で継続
  }

  const textMatch = message.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  for (const url of textMatch) {
    pushUrl(url);
  }

  return result;
}

function toViewerImageUrl(rawUrl: string): string | null {
  try {
    const url = new window.URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname;

    if (/\.(jpe?g|png|gif|webp|bmp|avif)(\?.*)?$/i.test(pathname)) {
      return url.href;
    }

    if (host === "i.imgur.com") {
      return url.href;
    }

    if (host === "imgur.com" || host === "m.imgur.com") {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length === 1) {
        const id = parts[0].split(".")[0];
        if (id) {
          return `https://i.imgur.com/${id}.jpg`;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getEventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

// --- インデックス構築 ---
interface ThreadIndexes {
  idIndex: Map<string, Set<number>>;
  repIndex: Map<number, Set<number>>;
  ancIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
}

function buildIndexes(responses: IRes[]): ThreadIndexes {
  const idIndex = new Map<string, Set<number>>();
  const repIndex = new Map<number, Set<number>>();
  const ancIndex = new Map<number, Set<number>>();
  const resMap = new Map<number, IRes>();

  for (const res of responses) {
    resMap.set(res.num, res);

    if (res.id) {
      if (!idIndex.has(res.id)) idIndex.set(res.id, new Set());
      idIndex.get(res.id)!.add(res.num);
    }

    const targets = parseAnchors(res.message);
    for (const target of targets) {
      if (!repIndex.has(target)) repIndex.set(target, new Set());
      repIndex.get(target)!.add(res.num);
      if (!ancIndex.has(res.num)) ancIndex.set(res.num, new Set());
      ancIndex.get(res.num)!.add(target);
    }
  }

  return { idIndex, repIndex, ancIndex, resMap };
}

type ThreadFilter = "all" | "popular" | "image" | "video" | "link";

interface Props {
  page: ThreadPageType;
}

// --- ポップアップ状態 ---
interface PopupState {
  x: number;
  y: number;
  items: IRes[];
  title: string;
}

interface TreePopupState {
  x: number;
  y: number;
  resNum: number;
}

interface ResContextMenuState {
  x: number;
  y: number;
  res: IRes;
}

interface ViewerState {
  src: string;
  label: string;
}

interface AnchorPreviewState {
  depth: number;
  x: number;
  y: number;
  items: IRes[];
  label: string;
}

const MAX_TREE_DEPTH = 10;
const ANCHOR_PREVIEW_OFFSET = 12;
const ANCHOR_PREVIEW_GUTTER = 16;
const ANCHOR_PREVIEW_MAX_WIDTH = 560;
const ANCHOR_PREVIEW_HIDE_DELAY_MS = 120;
const ANCHOR_SELECTOR = "a.anchor, a.name_anchor";

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
  const [anchorPreviews, setAnchorPreviews] = useState<AnchorPreviewState[]>([]);
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
      setError(
        e instanceof Error ? e.message : "スレッドの取得に失敗しました"
      );
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
    [indexes]
  );

  // 返信クリック → 返信ツリーをポップアップ表示
  const handleRepClick = useCallback(
    (resNum: number, e: React.MouseEvent) => {
      hideAnchorPreviewImmediately();
      setTreePopup({ x: e.clientX, y: e.clientY, resNum });
      setPopup(null);
    },
    []
  );

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

  const hideAnchorPreviewImmediately = useCallback((fromDepth = 0) => {
    clearAnchorPreviewHideTimer();
    setAnchorPreviews((prev) => prev.slice(0, fromDepth));
  }, [clearAnchorPreviewHideTimer]);

  const hideAnchorPreview = useCallback((fromDepth = 0) => {
    clearAnchorPreviewHideTimer();
    // 親子プレビュー間を横断する間は少し猶予を持たせ、子プレビューに入ったら閉じを打ち消す。
    anchorPreviewHideTimerRef.current = window.setTimeout(() => {
      anchorPreviewHideTimerRef.current = null;
      setAnchorPreviews((prev) => prev.slice(0, fromDepth));
    }, ANCHOR_PREVIEW_HIDE_DELAY_MS);
  }, [clearAnchorPreviewHideTimer]);

  const showAnchorPreview = useCallback(
    (
      targets: number[],
      anchorRect: DOMRect,
      label: string,
      depth: number
    ) => {
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
        window.innerWidth - ANCHOR_PREVIEW_GUTTER * 2
      );
      const x = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.left,
          window.innerWidth - maxWidth - ANCHOR_PREVIEW_GUTTER
        )
      );
      const y = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.bottom + ANCHOR_PREVIEW_OFFSET,
          window.innerHeight - ANCHOR_PREVIEW_GUTTER
        )
      );
      // 旧PopupViewと同様に深さごとのスタックで保持し、子プレビュー表示中も親を残す。
      setAnchorPreviews((prev) => {
        const next = prev.slice(0, depth);
        next.push({ depth, x, y, items, label });
        return next;
      });
    },
    [clearAnchorPreviewHideTimer, indexes.resMap]
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
      label.textContent =
        summary.direction === "Up" ? "▲ Top" : "▼ Bottom";
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
    [page.threadUrl]
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
  }, [addIdToNg, addWriteHistory, miniAaResNums, page.threadUrl, resContextMenu]);

  const filterButtons: { key: ThreadFilter; label: string }[] = [
    { key: "all", label: "全て" },
    { key: "popular", label: "多レス" },
    { key: "image", label: "画像" },
    { key: "video", label: "動画" },
    { key: "link", label: "リンク" },
  ];

  // アンカークリックで該当レスへスクロール
  const handleAnchorClick = useCallback((resNum: number) => {
    const host = rootRef.current;
    if (!host) return;
    hideAnchorPreviewImmediately();
    const target = host.querySelector(`[data-res-num="${resNum}"]`);
    if (!target) return;
    const scrollContainer = host.closest(".content-area");
    if (scrollContainer instanceof HTMLElement && target instanceof HTMLElement) {
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
      { once: true }
    );
  }, [hideAnchorPreviewImmediately]);

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
            <div className="anchor-preview__title">参照: {anchorPreview.label}</div>
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
          <div className="media-viewer__chrome" onClick={(e) => e.stopPropagation()}>
            <div className="media-viewer__toolbar">
              <span className="media-viewer__label">{viewer.label}</span>
              <div className="media-viewer__actions">
                <button
                  className="media-viewer__btn"
                  onClick={() =>
                    setViewerScale((prev) => Math.max(0.25, +(prev - 0.25).toFixed(2)))
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
                    setViewerScale((prev) => Math.min(5, +(prev + 0.25).toFixed(2)))
                  }
                  title="拡大"
                >
                  +
                </button>
                <button className="media-viewer__btn" onClick={closeViewer} title="閉じる">
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

// --- 個別レス表示 ---

interface ResItemProps {
  res: IRes;
  idPos: number;
  idCount: number;
  repCount: number;
  miniAa: boolean;
  messageProtocol: string;
  onIdClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onUrlClick: (url: string) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

interface ResBodyProps {
  messageHtml: string;
  anchorPreviewDepth: number;
  onUrlClick: (url: string) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
}

const ResBody: React.FC<ResBodyProps> = React.memo(
  ({
    messageHtml,
    anchorPreviewDepth,
    onUrlClick,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
  }) => {
    const hoveredAnchorRef = useRef<HTMLAnchorElement | null>(null);

    return (
      <div
        className="res__body"
        dangerouslySetInnerHTML={{ __html: messageHtml }}
        onMouseOver={(e) => {
          const target = getEventTargetElement(e.target);
          const anchor = target?.closest(ANCHOR_SELECTOR);
          if (!(anchor instanceof HTMLAnchorElement)) {
            if (hoveredAnchorRef.current) {
              hoveredAnchorRef.current = null;
              onAnchorLeave(anchorPreviewDepth);
            }
            return;
          }
          if (hoveredAnchorRef.current === anchor) {
            return;
          }
          hoveredAnchorRef.current = anchor;
          const label = anchor.textContent?.trim() ?? "";
          const targets = parseAnchorDisplayTargets(label);
          if (targets.length === 0) {
            hoveredAnchorRef.current = null;
            onAnchorLeave(anchorPreviewDepth);
            return;
          }
          // 同じアンカー上の細かなマウス移動では再配置せず、プレビューを安定表示させる。
          onAnchorHover(
            targets,
            anchor.getBoundingClientRect(),
            label,
            anchorPreviewDepth
          );
        }}
        onMouseLeave={() => {
          hoveredAnchorRef.current = null;
          onAnchorLeave(anchorPreviewDepth);
        }}
        onClick={(e) => {
          const target = getEventTargetElement(e.target);
          const anchor = target?.closest("a");
          if (!(anchor instanceof HTMLAnchorElement)) return;
          if (anchor.matches(ANCHOR_SELECTOR)) {
            e.preventDefault();
            if (anchor.classList.contains("disabled")) {
              return;
            }
            const label = anchor.textContent?.trim() ?? "";
            const targets = parseAnchorDisplayTargets(label);
            if (targets.length > 0) {
              onAnchorClick(targets[0]);
            }
            return;
          }
          const href = anchor.getAttribute("href") ?? "";
          if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
            return;
          }
          e.preventDefault();
          onUrlClick(href);
        }}
      />
    );
  }
);
ResBody.displayName = "ResBody";

const ResItem: React.FC<ResItemProps> = React.memo(
  ({
    res,
    idPos,
    idCount,
    repCount,
    miniAa,
    messageProtocol,
    onIdClick,
    onRepClick,
    onUrlClick,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    onContextMenu,
  }) => {
    const isNG = res.class?.includes("ng");
    const decoded = useMemo(
      () => decodeResponseHtml(res, messageProtocol),
      [messageProtocol, res]
    );
    const urls = useMemo(
      () => extractUrlsFromMessage(decoded.messageHtml),
      [decoded.messageHtml]
    );
    const imageUrls = useMemo(
      () => urls.map((url) => ({ raw: url, src: toViewerImageUrl(url) })).filter((x) => !!x.src),
      [urls]
    );

    return (
      <article
        data-res-num={res.num}
        className={`res${isNG ? " res--ng" : ""}${miniAa ? " res--aa" : ""}`}
        onContextMenu={onContextMenu}
      >
        <header className="res__header">
          <span className="res__num">{res.num}</span>
          <span
            className="res__name"
            dangerouslySetInnerHTML={{ __html: decoded.nameHtml }}
          />
          {res.id && (
            <span
              className={`res__id${
                idCount >= 5
                  ? " res__id--freq"
                  : idCount >= 2
                    ? " res__id--link"
                    : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onIdClick(res.id!, e);
              }}
            >
              {res.id}
              {idCount >= 2 && `(${idPos}/${idCount})`}
            </span>
          )}
          <span className="res__date">{res.date ?? res.other}</span>
          {repCount > 0 && (
            <span
              className={`res__rep${repCount >= 5 ? " res__rep--freq" : " res__rep--link"}`}
              onClick={(e) => {
                e.stopPropagation();
                onRepClick(res.num, e);
              }}
            >
              返信({repCount})
            </span>
          )}
        </header>
        <ResBody
          messageHtml={decoded.messageHtml}
          anchorPreviewDepth={0}
          onUrlClick={onUrlClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
        {urls.length > 0 && (
          <div className="res__links">
            {urls.map((url) => (
              <button
                key={`${res.num}:${url}`}
                className="res__link"
                onClick={() => onUrlClick(url)}
                title={url}
              >
                {url}
              </button>
            ))}
          </div>
        )}
        {imageUrls.length > 0 && (
          <div className="res__thumbs">
            {imageUrls.map(({ raw, src }) => (
              <button
                key={`${res.num}:thumb:${raw}`}
                className="res__thumb"
                onClick={() => onUrlClick(raw)}
                title={raw}
              >
                <img src={src ?? ""} alt={raw} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </article>
    );
  }
);
ResItem.displayName = "ResItem";

interface StaticResCardProps {
  res: IRes;
  messageProtocol: string;
  anchorPreviewDepth: number;
  onUrlClick: (url: string) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu?: (e: React.MouseEvent, res: IRes) => void;
}

const PopupResCard: React.FC<StaticResCardProps> = React.memo(
  ({
    res,
    messageProtocol,
    anchorPreviewDepth,
    onUrlClick,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    onContextMenu,
  }) => {
    const decoded = useMemo(
      () => decodeResponseHtml(res, messageProtocol),
      [messageProtocol, res]
    );

    return (
      <article
        className="res"
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          e.preventDefault();
          onContextMenu(e, res);
        }}
      >
        <header className="res__header">
          <span className="res__num">{res.num}</span>
          <span
            className="res__name"
            dangerouslySetInnerHTML={{ __html: decoded.nameHtml }}
          />
          {res.id && <span className="res__id">{res.id}</span>}
          <span className="res__date">{res.date ?? res.other}</span>
        </header>
        <ResBody
          messageHtml={decoded.messageHtml}
          anchorPreviewDepth={anchorPreviewDepth}
          onUrlClick={onUrlClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
      </article>
    );
  }
);
PopupResCard.displayName = "PopupResCard";

// --- IDポップアップ ---

const ResPopup: React.FC<{
  x: number;
  y: number;
  title: string;
  items: IRes[];
  messageProtocol: string;
  onUrlClick: (url: string) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onResContextMenu: (e: React.MouseEvent, res: IRes) => void;
  onClose: () => void;
}> = ({
  x,
  y,
  title,
  items,
  messageProtocol,
  onUrlClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onResContextMenu,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // ビューポート内に収まるよう位置を補正
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      ref.current.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      ref.current.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  }, []);

  return (
    <div ref={ref} className="res-popup" style={{ left: x, top: y }}>
      <div className="res-popup__header">
        <span>{title}</span>
        <button className="res-popup__close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="res-popup__body">
        {items.map((res) => (
          <PopupResCard
            key={res.num}
            res={res}
            messageProtocol={messageProtocol}
            anchorPreviewDepth={0}
            onUrlClick={onUrlClick}
            onAnchorClick={onAnchorClick}
            onAnchorHover={onAnchorHover}
            onAnchorLeave={onAnchorLeave}
            onContextMenu={onResContextMenu}
          />
        ))}
      </div>
    </div>
  );
};

// --- 返信ツリーポップアップ ---

const ReplyTreePopup: React.FC<{
  x: number;
  y: number;
  resNum: number;
  repIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
  messageProtocol: string;
  onUrlClick: (url: string) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onResContextMenu: (e: React.MouseEvent, res: IRes) => void;
  onClose: () => void;
}> = ({
  x,
  y,
  resNum,
  repIndex,
  resMap,
  messageProtocol,
  onUrlClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onResContextMenu,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      ref.current.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      ref.current.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  }, []);

  return (
    <div ref={ref} className="res-popup" style={{ left: x, top: y }}>
      <div className="res-popup__header">
        <span>{`>>${resNum} への返信ツリー`}</span>
        <button className="res-popup__close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="res-popup__body">
        <ReplyTree
          resNum={resNum}
          repIndex={repIndex}
          resMap={resMap}
          messageProtocol={messageProtocol}
          onUrlClick={onUrlClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
          onResContextMenu={onResContextMenu}
          visited={new Set()}
          depth={0}
        />
      </div>
    </div>
  );
};

// --- 再帰的返信ツリー ---

const ReplyTree: React.FC<{
  resNum: number;
  repIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
  messageProtocol: string;
  onUrlClick: (url: string) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onResContextMenu: (e: React.MouseEvent, res: IRes) => void;
  visited: Set<number>;
  depth: number;
}> = ({
  resNum,
  repIndex,
  resMap,
  messageProtocol,
  onUrlClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onResContextMenu,
  visited,
  depth,
}) => {
  if (depth >= MAX_TREE_DEPTH) return null;
  const replies = repIndex.get(resNum);
  if (!replies || replies.size === 0) return null;

  const validReplies = Array.from(replies)
    .sort((a, b) => a - b)
    .filter((n) => !visited.has(n) && resMap.has(n));

  if (validReplies.length === 0) return null;

  return (
    <div
      className="reply-tree"
      style={{
        marginLeft: depth > 0 ? 12 : 0,
        borderLeft:
          depth > 0 ? "2px solid rgba(128, 128, 128, 0.3)" : "none",
        paddingLeft: depth > 0 ? 8 : 0,
      }}
    >
      {validReplies.map((replyNum) => {
        // 循環参照防止のためvisitedに追加
        visited.add(replyNum);
        const res = resMap.get(replyNum)!;
        return (
          <React.Fragment key={replyNum}>
            <PopupResCard
              res={res}
              messageProtocol={messageProtocol}
              anchorPreviewDepth={0}
              onUrlClick={onUrlClick}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
              onAnchorLeave={onAnchorLeave}
              onContextMenu={onResContextMenu}
            />
            <ReplyTree
              resNum={replyNum}
              repIndex={repIndex}
              resMap={resMap}
              messageProtocol={messageProtocol}
              onUrlClick={onUrlClick}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
              onAnchorLeave={onAnchorLeave}
              onResContextMenu={onResContextMenu}
              visited={visited}
              depth={depth + 1}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};
