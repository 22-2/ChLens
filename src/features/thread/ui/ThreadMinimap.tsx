import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerDebugStateProvider } from "src/app/debug/debug-api";
import type { ThreadResponseLayout } from "src/features/thread/browser/use-thread-virtual-list";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getResizeObserverForWindow, isHTMLElementInWindow } from "src/view/browser/utils/dom";

interface ThreadMinimapProps {
  rootRef: React.RefObject<HTMLDivElement | null>;
  /**
   * レスの位置。変更理由: レス一覧を仮想化して範囲外のレスがDOMにないため、
   * マーカーの位置はDOMではなくレス一覧の位置計算から読む。
   */
  layout: ThreadResponseLayout;
  repIndex: Map<number, Set<number>>;
  responseCount: number;
  activeTopBar: "none" | "search" | "filter";
  /**
   * ミニマップ上のレスをクリックしたときの処理。
   * `scroll: false` は、ポインタ操作ですでに移動した位置を維持して強調だけを行う。
   */
  onResponseClick: (
    resNum: number,
    options: { scroll: boolean; align?: "start" | "center" },
  ) => void;
  /** E2Eから表示領域枠の位置を読むためのデバッグ名。 */
  debugKey?: string;
}

interface MinimapFrame {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface MinimapResponseEntry {
  resNum: number;
  top: number;
  size: number;
  /** 表示中のレスの中での順位。高さの実測値が変わっても動かない。 */
  ordinal: number;
}

interface MinimapMetrics {
  scrollHeight: number;
  clientHeight: number;
  listTop: number;
  viewportHeightPx: number;
  viewportTopPx: number;
  viewportTopOrdinal: number;
  viewportBottomOrdinal: number;
  maxScrollTop: number;
}

interface MinimapDebugState {
  scrollTop: number;
  totalSize: number;
  clientHeight: number;
  frameHeight: number;
  responseTotal: number;
  viewportTopOrdinal: number;
  viewportBottomOrdinal: number;
  markers: { resNum: number; x: number; y: number }[];
}

interface MinimapMarkerHit {
  resNum: number;
  x: number;
  y: number;
  radius: number;
}

interface MinimapResponseHit {
  resNum: number;
  top: number;
  bottom: number;
}

const MINIMAP_MIN_WIDTH = 30;
const MINIMAP_MAX_WIDTH = 180;
const MINIMAP_WIDTH_RATIO = 0.08;
const MINIMAP_CONTENT_GAP = 10;
const MINIMAP_MIN_DRAWABLE_HEIGHT = 80;
const MINIMAP_MARKER_SNAP_DISTANCE = 8;
const MINIMAP_MARKER_WIDTH = 8;
const MINIMAP_MARKER_HALF_HEIGHT = 5;
const MINIMAP_TOOLTIP_EDGE_PADDING = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isSameFrame(left: MinimapFrame | null, right: MinimapFrame | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return (
    left.top === right.top &&
    left.left === right.left &&
    left.width === right.width &&
    left.height === right.height
  );
}

function collectResponses(layout: ThreadResponseLayout): MinimapResponseEntry[] {
  const entries: MinimapResponseEntry[] = [];
  layout.forEachResponse((resNum, top, size) => {
    if (size === 0) return;
    entries.push({ resNum, top, size, ordinal: entries.length });
  });
  return entries;
}

/**
 * リスト内のピクセル位置を「何番目のレスか」の割合へ変換する。
 *
 * 仮想スクロールでは未実測レスの高さが推定値から実測値へ置き換わり、全体の高さと
 * 各レスの位置がスクロール中も変わる。ピクセル位置をそのままミニマップへ写すと
 * マーカーが動いて見えるため、位置はレス順位を基準にし、レス内の割合だけ高さを使う。
 */
function listYToOrdinal(entries: readonly MinimapResponseEntry[], listY: number): number {
  if (entries.length === 0) {
    return 0;
  }

  const first = entries[0]!;
  const last = entries[entries.length - 1]!;
  if (listY <= first.top) {
    return 0;
  }
  if (listY >= last.top + last.size) {
    return entries.length;
  }

  let low = 0;
  let high = entries.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (entries[middle]!.top <= listY) low = middle;
    else high = middle - 1;
  }

  const entry = entries[low]!;
  const fraction = entry.size > 0 ? clamp((listY - entry.top) / entry.size, 0, 1) : 0;
  return entry.ordinal + fraction;
}

/** レス順位をリスト内のピクセル位置へ戻す。ミニマップのクリック位置から移動先を決める。 */
function ordinalToListY(entries: readonly MinimapResponseEntry[], ordinal: number): number {
  if (entries.length === 0) {
    return 0;
  }
  if (ordinal <= 0) {
    return entries[0]!.top;
  }
  if (ordinal >= entries.length) {
    const last = entries[entries.length - 1]!;
    return last.top + last.size;
  }

  const index = Math.floor(ordinal);
  const entry = entries[index]!;
  return entry.top + entry.size * (ordinal - index);
}

export const ThreadMinimap: React.FC<ThreadMinimapProps> = ({
  rootRef,
  layout,
  repIndex,
  responseCount,
  activeTopBar,
  onResponseClick,
  debugKey,
}) => {
  const { window: viewWindow } = useViewSurface();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRafRef = useRef<number | null>(null);
  const markerHitsRef = useRef<MinimapMarkerHit[]>([]);
  const responseHitsRef = useRef<MinimapResponseHit[]>([]);
  const hoverLineYRef = useRef<number | null>(null);
  // 変更理由: pointerUp時のコールバックから最新のスティッチ先を読むため、
  // hoveredResNum stateと同期したrefを持つ。stateだけではclosureが古くなる。
  const hoveredResNumRef = useRef<number | null>(null);
  const debugStateRef = useRef<MinimapDebugState>({
    scrollTop: 0,
    totalSize: 0,
    clientHeight: 0,
    frameHeight: 0,
    responseTotal: 0,
    viewportTopOrdinal: 0,
    viewportBottomOrdinal: 0,
    markers: [],
  });
  const pointerStateRef = useRef({
    isDragging: false,
    pointerId: -1,
    mode: "idle" as "idle" | "scroll" | "marker",
    dragOffset: 0,
    startX: 0,
    startY: 0,
    markerResNum: null as number | null,
  });
  const [frame, setFrame] = useState<MinimapFrame | null>(null);
  const [hoveredResNum, setHoveredResNum] = useState<number | null>(null);
  const [hoverLineY, setHoverLineY] = useState<number | null>(null);

  const getScrollContainer = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }

    const panel = host.closest(".content-area__tab-panel");
    return isHTMLElementInWindow(panel, viewWindow) ? panel : null;
  }, [rootRef, viewWindow]);

  const getTopBarRoot = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }
    const topBar = host.querySelector(".thread-page__top-bar");
    return isHTMLElementInWindow(topBar, viewWindow) ? topBar : null;
  }, [rootRef, viewWindow]);

  const setHostMinimapWidth = useCallback(
    (widthPx: number) => {
      const host = rootRef.current;
      if (!host) {
        return;
      }
      host.style.setProperty("--thread-minimap-width", `${Math.max(0, widthPx)}px`);
      host.classList.toggle("thread-page--with-minimap", widthPx > 0);
    },
    [rootRef],
  );

  const updateFrame = useCallback(() => {
    const scrollContainer = getScrollContainer();
    const topBar = getTopBarRoot();
    if (!scrollContainer || responseCount === 0) {
      setFrame((prev) => (prev === null ? prev : null));
      setHostMinimapWidth(0);
      return;
    }

    const rect = scrollContainer.getBoundingClientRect();
    const topBarRect = topBar?.getBoundingClientRect() ?? null;
    // 上部バーの種類に関係なく bottom をミニマップ上端に揃え、重なりを避ける。
    const top = clamp(topBarRect?.bottom ?? rect.top, rect.top, rect.bottom);
    const availableHeight = rect.bottom - top;
    if (availableHeight < MINIMAP_MIN_DRAWABLE_HEIGHT || rect.width < 280) {
      setFrame((prev) => (prev === null ? prev : null));
      setHostMinimapWidth(0);
      return;
    }

    const width = clamp(
      Math.round(viewWindow.innerWidth * MINIMAP_WIDTH_RATIO),
      MINIMAP_MIN_WIDTH,
      MINIMAP_MAX_WIDTH,
    );

    const scrollbarWidth = Math.max(0, scrollContainer.offsetWidth - scrollContainer.clientWidth);
    // スクロールバーと重なるとドラッグ操作が失敗しやすいので、バー幅ぶん左へ逃がす。
    // 変更理由: 右端の余白は設けず、ペイン基準の右端へスクロールバー直前まで寄せる。
    const preferredLeft = rect.right - scrollbarWidth - width;
    const left = Math.max(rect.left + 8, preferredLeft);

    const nextFrame: MinimapFrame = {
      // ミニマップ上端 = toolbar bottom を満たし、重なりを完全に避ける。
      top,
      left,
      width,
      height: availableHeight,
    };

    setFrame((prev) => {
      // レイアウトが不変なのに毎回新しい object を入れると、
      // frame 依存 callback/effect が連鎖して passive effect loop になる。
      return isSameFrame(prev, nextFrame) ? prev : nextFrame;
    });
    // 本文をミニマップの下に潜り込ませないため、同じ幅を右余白として予約する。
    setHostMinimapWidth(width + MINIMAP_CONTENT_GAP);
  }, [getScrollContainer, getTopBarRoot, responseCount, setHostMinimapWidth, viewWindow]);

  const getMetrics = useCallback(
    (entries: readonly MinimapResponseEntry[]): MinimapMetrics | null => {
      const scrollContainer = getScrollContainer();
      const currentFrame = frame;
      const listTop = layout.getListTop();
      if (!scrollContainer || !currentFrame || listTop === null) {
        return null;
      }

      const scrollHeight = Math.max(scrollContainer.scrollHeight, 1);
      const clientHeight = Math.max(scrollContainer.clientHeight, 1);
      const responseTotal = entries.length;
      let viewportTopPx = 0;
      let viewportHeightPx = 6;
      let viewportTopOrdinal = 0;
      let viewportBottomOrdinal = 0;

      if (responseTotal > 0) {
        // 現在位置枠もレス順位で描く。実測高さの置換で総高さが変わっても枠が跳ねない。
        viewportTopOrdinal = listYToOrdinal(entries, scrollContainer.scrollTop - listTop);
        viewportBottomOrdinal = listYToOrdinal(
          entries,
          scrollContainer.scrollTop - listTop + clientHeight,
        );
        const topRatio = viewportTopOrdinal / responseTotal;
        const bottomRatio = viewportBottomOrdinal / responseTotal;
        viewportHeightPx = Math.max((bottomRatio - topRatio) * currentFrame.height, 6);
        viewportTopPx = clamp(
          topRatio * currentFrame.height,
          0,
          Math.max(currentFrame.height - viewportHeightPx, 0),
        );
      }

      return {
        scrollHeight,
        clientHeight,
        listTop,
        viewportHeightPx,
        viewportTopPx,
        viewportTopOrdinal,
        viewportBottomOrdinal,
        maxScrollTop: Math.max(scrollHeight - clientHeight, 0),
      };
    },
    [frame, getScrollContainer, layout],
  );

  const draw = useCallback(() => {
    markerHitsRef.current = [];
    responseHitsRef.current = [];
    const canvas = canvasRef.current;
    const scrollContainer = getScrollContainer();
    const entries = collectResponses(layout);
    const metrics = getMetrics(entries);
    const currentFrame = frame;
    if (!canvas || !scrollContainer || !metrics || !currentFrame) {
      return;
    }

    const dpr = viewWindow.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.round(currentFrame.width));
    const cssHeight = Math.max(1, Math.round(currentFrame.height));
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const minY = 6;
    const maxY = cssHeight - 6;
    const markerX = cssWidth - 6;
    const markerHitRadius = 12;
    const markerHits: MinimapMarkerHit[] = [];
    const responseHits: MinimapResponseHit[] = [];
    const entryByResNum = new Map(entries.map((entry) => [entry.resNum, entry]));
    const responseTotal = entries.length;
    const markerStyles = viewWindow.getComputedStyle(canvas);

    if (responseTotal > 0) {
      for (const entry of entries) {
        responseHits.push({
          resNum: entry.resNum,
          top: (entry.ordinal / responseTotal) * cssHeight,
          bottom: ((entry.ordinal + 1) / responseTotal) * cssHeight,
        });
      }
    }
    responseHitsRef.current = responseHits;
    for (const [resNum, responders] of repIndex.entries()) {
      const count = responders.size;
      if (count < 3) {
        continue;
      }

      const entry = entryByResNum.get(resNum);
      if (!entry) {
        continue;
      }

      // レス順位の中点へ置く。`size` はレス内の位置補間だけに使い、マーカー自体は動かさない。
      const centerY = ((entry.ordinal + 0.5) / responseTotal) * cssHeight;
      const y = clamp(centerY, minY, maxY);

      // フォントの文字中心は環境で数pxずれるため、パスで描いてホバー線と中心を厳密に合わせる。
      // 変更理由: 返信が集まるほど段階を分け、10件以上は紫でひと目で見つけられるようにする。
      const markerColorToken =
        count >= 10
          ? "--sys-color-minimap-marker-very-popular"
          : count >= 5
            ? "--sys-color-minimap-marker-popular"
            : "--sys-color-minimap-marker-reply";
      ctx.fillStyle = markerStyles.getPropertyValue(markerColorToken).trim();
      ctx.globalAlpha = count >= 5 ? 0.95 : 0.9;
      ctx.beginPath();
      ctx.moveTo(markerX - MINIMAP_MARKER_WIDTH, y);
      ctx.lineTo(markerX, y - MINIMAP_MARKER_HALF_HEIGHT);
      ctx.lineTo(markerX, y + MINIMAP_MARKER_HALF_HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // 実際の三角記号より広い当たり判定を持たせ、細いミニマップでもクリックしやすくする。
      markerHits.push({
        resNum,
        x: markerX,
        y,
        radius: markerHitRadius,
      });
    }
    markerHitsRef.current = markerHits;
    debugStateRef.current = {
      scrollTop: scrollContainer.scrollTop,
      totalSize: metrics.scrollHeight,
      clientHeight: metrics.clientHeight,
      frameHeight: cssHeight,
      responseTotal,
      viewportTopOrdinal: metrics.viewportTopOrdinal,
      viewportBottomOrdinal: metrics.viewportBottomOrdinal,
      markers: markerHits.map(({ resNum, x, y }) => ({ resNum, x, y })),
    };

    ctx.fillStyle = "rgba(26, 115, 232, 0.28)";
    ctx.fillRect(0, metrics.viewportTopPx, cssWidth, metrics.viewportHeightPx);

    ctx.strokeStyle = "rgba(26, 115, 232, 0.82)";
    ctx.strokeRect(
      0.5,
      metrics.viewportTopPx + 0.5,
      cssWidth - 1,
      Math.max(metrics.viewportHeightPx - 1, 1),
    );

    if (hoverLineYRef.current != null) {
      const hoverLineY = hoverLineYRef.current;
      ctx.beginPath();
      ctx.moveTo(0, hoverLineY + 0.5);
      ctx.lineTo(cssWidth, hoverLineY + 0.5);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(26, 115, 232, 0.95)";
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);
    ctx.restore();
  }, [frame, getMetrics, getScrollContainer, layout, repIndex, viewWindow]);

  const findMarkerByPoint = useCallback(
    (relativeX: number, relativeY: number): MinimapMarkerHit | null => {
      let nearest: MinimapMarkerHit | null = null;
      let nearestDistSq = Number.POSITIVE_INFINITY;

      for (const marker of markerHitsRef.current) {
        const dx = relativeX - marker.x;
        const dy = relativeY - marker.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= marker.radius * marker.radius && distSq < nearestDistSq) {
          nearest = marker;
          nearestDistSq = distSq;
        }
      }

      return nearest;
    },
    [],
  );

  const scheduleDraw = useCallback(() => {
    if (drawRafRef.current != null) {
      return;
    }
    // 同期的な requestAnimationFrame stub でも完了後に予約済み扱いへ戻らないよう、
    // callback が先に走った場合は null を維持する。
    drawRafRef.current = -1;
    const requestId = viewWindow.requestAnimationFrame(() => {
      drawRafRef.current = null;
      draw();
    });
    if (drawRafRef.current != null) {
      drawRafRef.current = requestId;
    }
  }, [draw, viewWindow]);

  const updateHoverLine = useCallback(
    (relativeY: number) => {
      let nextY = relativeY;
      let nearestDistance = MINIMAP_MARKER_SNAP_DISTANCE + 1;
      let nextResNum: number | null = null;

      for (const marker of markerHitsRef.current) {
        const distance = Math.abs(relativeY - marker.y);
        if (distance <= MINIMAP_MARKER_SNAP_DISTANCE && distance < nearestDistance) {
          nextY = marker.y;
          nearestDistance = distance;
          nextResNum = marker.resNum;
        }
      }

      if (nextResNum == null) {
        let nearestResponseDistance = Number.POSITIVE_INFINITY;
        for (const response of responseHitsRef.current) {
          const distance =
            nextY < response.top
              ? response.top - nextY
              : nextY > response.bottom
                ? nextY - response.bottom
                : 0;
          if (distance < nearestResponseDistance) {
            nextResNum = response.resNum;
            nearestResponseDistance = distance;
          }
        }
      }

      // 人気レスの近傍だけマーカー位置へ吸着させ、細いミニマップでも狙いやすくする。
      hoverLineYRef.current = nextY;
      hoveredResNumRef.current = nextResNum;
      setHoveredResNum((current) => (current === nextResNum ? current : nextResNum));
      setHoverLineY((current) => (current === nextY ? current : nextY));
      scheduleDraw();
    },
    [scheduleDraw],
  );

  const scrollByPointer = useCallback(
    (relativeY: number, useDragOffset: boolean) => {
      const scrollContainer = getScrollContainer();
      const currentFrame = frame;
      const entries = collectResponses(layout);
      const metrics = getMetrics(entries);
      if (!scrollContainer || !currentFrame || !metrics || entries.length === 0) {
        return;
      }

      const dragOffset = pointerStateRef.current.dragOffset;
      const bandTop = clamp(
        relativeY - (useDragOffset ? dragOffset : metrics.viewportHeightPx / 2),
        0,
        currentFrame.height,
      );
      const ordinal = (bandTop / currentFrame.height) * entries.length;
      const targetTop = metrics.listTop + ordinalToListY(entries, ordinal);

      scrollContainer.scrollTo({
        top: clamp(targetTop, 0, metrics.maxScrollTop),
        behavior: "auto",
      });
    },
    [frame, getMetrics, getScrollContainer, layout],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const entries = collectResponses(layout);
      const metrics = getMetrics(entries);
      const currentFrame = frame;
      if (!metrics || !currentFrame) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const relativeX = event.clientX - currentFrame.left;
      const relativeY = clamp(event.clientY - currentFrame.top, 0, currentFrame.height);
      updateHoverLine(relativeY);
      const markerHit = findMarkerByPoint(relativeX, relativeY);
      if (markerHit) {
        pointerStateRef.current.isDragging = true;
        pointerStateRef.current.pointerId = event.pointerId;
        pointerStateRef.current.mode = "marker";
        pointerStateRef.current.dragOffset = 0;
        pointerStateRef.current.startX = relativeX;
        pointerStateRef.current.startY = relativeY;
        pointerStateRef.current.markerResNum = markerHit.resNum;
        return;
      }

      const inViewport =
        relativeY >= metrics.viewportTopPx &&
        relativeY <= metrics.viewportTopPx + metrics.viewportHeightPx;

      pointerStateRef.current.isDragging = true;
      pointerStateRef.current.pointerId = event.pointerId;
      pointerStateRef.current.mode = "scroll";
      pointerStateRef.current.dragOffset = inViewport
        ? relativeY - metrics.viewportTopPx
        : metrics.viewportHeightPx / 2;
      pointerStateRef.current.startX = relativeX;
      pointerStateRef.current.startY = relativeY;
      pointerStateRef.current.markerResNum = null;

      scrollByPointer(relativeY, inViewport);
    },
    [findMarkerByPoint, frame, getMetrics, layout, scrollByPointer, updateHoverLine],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const currentFrame = frame;
      if (!currentFrame) {
        return;
      }
      const relativeY = clamp(event.clientY - currentFrame.top, 0, currentFrame.height);
      updateHoverLine(relativeY);

      if (
        !pointerStateRef.current.isDragging ||
        pointerStateRef.current.pointerId !== event.pointerId
      ) {
        return;
      }
      if (pointerStateRef.current.mode !== "scroll") {
        return;
      }

      event.preventDefault();
      scrollByPointer(relativeY, true);
    },
    [frame, scrollByPointer, updateHoverLine],
  );

  const handlePointerLeave = useCallback(() => {
    if (pointerStateRef.current.isDragging) {
      return;
    }
    hoverLineYRef.current = null;
    hoveredResNumRef.current = null;
    setHoveredResNum(null);
    setHoverLineY(null);
    scheduleDraw();
  }, [scheduleDraw]);

  const releasePointerState = useCallback(() => {
    pointerStateRef.current.isDragging = false;
    pointerStateRef.current.pointerId = -1;
    pointerStateRef.current.mode = "idle";
    pointerStateRef.current.dragOffset = 0;
    pointerStateRef.current.startX = 0;
    pointerStateRef.current.startY = 0;
    pointerStateRef.current.markerResNum = null;
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (
        !pointerStateRef.current.isDragging ||
        pointerStateRef.current.pointerId !== event.pointerId
      ) {
        return;
      }

      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (pointerStateRef.current.mode === "marker") {
        const currentFrame = frame;
        if (currentFrame && pointerStateRef.current.markerResNum != null) {
          const relativeX = event.clientX - currentFrame.left;
          const relativeY = clamp(event.clientY - currentFrame.top, 0, currentFrame.height);
          const moveX = relativeX - pointerStateRef.current.startX;
          const moveY = relativeY - pointerStateRef.current.startY;
          const movedDistanceSq = moveX * moveX + moveY * moveY;
          // 軽微なブレはクリックとして扱い、既存のジャンプ＆ハイライトへ委譲する。
          if (movedDistanceSq <= 144) {
            // 三角はレス枠の中央にあるため、中央揃えでジャンプすると枠の中心と一致する。
            onResponseClick(pointerStateRef.current.markerResNum, {
              scroll: true,
              align: "center",
            });
          }
        }
      } else if (pointerStateRef.current.mode === "scroll") {
        const currentFrame = frame;
        if (currentFrame) {
          const relativeX = event.clientX - currentFrame.left;
          const relativeY = clamp(event.clientY - currentFrame.top, 0, currentFrame.height);
          const moveX = relativeX - pointerStateRef.current.startX;
          const moveY = relativeY - pointerStateRef.current.startY;
          const movedDistanceSq = moveX * moveX + moveY * moveY;
          // 変更理由: ポインタダウンでクリック位置までスクロール済みのため、
          // 離したときにレス先頭へ寄せ直すと表示領域枠が大きく飛ぶ。強調だけを行う。
          // ドラッグによるスクロールでは強調しない。
          if (movedDistanceSq <= 144 && hoveredResNumRef.current != null) {
            onResponseClick(hoveredResNumRef.current, { scroll: false });
          }
        }
      }

      releasePointerState();
    },
    [frame, onResponseClick, releasePointerState],
  );

  useEffect(() => {
    if (!debugKey) return;
    return registerDebugStateProvider(debugKey, () => debugStateRef.current);
  }, [debugKey]);

  useEffect(() => {
    updateFrame();
  }, [activeTopBar, responseCount, updateFrame]);

  useEffect(() => {
    // 描画は frame/返信分布の変化にだけ追従させ、
    // レイアウト計算 effect と分離して再入ループを防ぐ。
    scheduleDraw();
  }, [frame, repIndex, responseCount, scheduleDraw]);

  // 実測でレスの位置が変わったら描き直す。描画は rAF でまとめるため、続けて変わっても1回で済む。
  useEffect(() => layout.subscribe(scheduleDraw), [layout, scheduleDraw]);

  useEffect(() => {
    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return;
    }

    const onPanelScroll = () => {
      scheduleDraw();
    };
    const onWindowResize = () => {
      updateFrame();
      scheduleDraw();
    };

    scrollContainer.addEventListener("scroll", onPanelScroll, {
      passive: true,
    });
    viewWindow.addEventListener("resize", onWindowResize);

    const ResizeObserverConstructor = getResizeObserverForWindow(viewWindow);
    const resizeObserver = ResizeObserverConstructor
      ? new ResizeObserverConstructor(() => {
          updateFrame();
          scheduleDraw();
        })
      : null;
    if (resizeObserver) {
      resizeObserver.observe(scrollContainer);
    }

    return () => {
      scrollContainer.removeEventListener("scroll", onPanelScroll);
      viewWindow.removeEventListener("resize", onWindowResize);
      resizeObserver?.disconnect();
    };
  }, [getScrollContainer, scheduleDraw, updateFrame, viewWindow]);

  useEffect(() => {
    return () => {
      if (drawRafRef.current != null) {
        viewWindow.cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
      setHostMinimapWidth(0);
      releasePointerState();
    };
  }, [releasePointerState, setHostMinimapWidth, viewWindow]);

  const style = useMemo<React.CSSProperties | undefined>(() => {
    if (!frame) {
      return undefined;
    }
    return {
      top: `${frame.top}px`,
      left: `${frame.left}px`,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
    };
  }, [frame]);

  const tooltipStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!frame || hoverLineY == null) {
      return undefined;
    }
    // ミニマップのカーソルYをそのまま使う。RadixのTrigger基準ではキャンバス中央に固定されるため、
    // ホバー位置に追従するラベルは自前で配置する。端では見切れない位置へ寄せる。
    const top = clamp(
      frame.top + hoverLineY,
      frame.top + MINIMAP_TOOLTIP_EDGE_PADDING,
      frame.top + frame.height - MINIMAP_TOOLTIP_EDGE_PADDING,
    );
    return {
      top: `${top}px`,
      left: `calc(${frame.left}px - var(--sys-space-6))`,
    };
  }, [frame, hoverLineY]);

  if (!frame) {
    return null;
  }

  return (
    <>
      <div className="thread-page__minimap" style={style} aria-hidden="true">
        <canvas
          ref={canvasRef}
          className="thread-page__minimap-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
      {hoveredResNum != null && hoverLineY != null && (
        <div
          className="browser-tooltip thread-page__minimap-tooltip"
          role="tooltip"
          style={tooltipStyle}
        >
          {`レス ${hoveredResNum}`}
        </div>
      )}
    </>
  );
};
