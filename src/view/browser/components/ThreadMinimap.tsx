import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface ThreadMinimapProps {
  rootRef: React.RefObject<HTMLDivElement | null>;
  repIndex: Map<number, Set<number>>;
  responseCount: number;
  activeTopBar: "none" | "search" | "filter";
  onMarkerClick: (resNum: number) => void;
}

interface MinimapFrame {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface MinimapMetrics {
  scrollHeight: number;
  clientHeight: number;
  scale: number;
  viewportHeightPx: number;
  viewportTopPx: number;
  maxViewportTop: number;
}

interface MinimapMarkerHit {
  resNum: number;
  x: number;
  y: number;
  radius: number;
}

const MINIMAP_MIN_WIDTH = 30;
const MINIMAP_MAX_WIDTH = 180;
const MINIMAP_WIDTH_RATIO = 0.08;
const MINIMAP_GAP = 10;
const MINIMAP_MIN_DRAWABLE_HEIGHT = 80;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getOffsetTopWithinAncestor(
  el: HTMLElement,
  ancestor: HTMLElement,
): number {
  let top = 0;
  let current: HTMLElement | null = el;

  while (current && current !== ancestor) {
    top += current.offsetTop;
    current =
      current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }

  if (current === ancestor) {
    return top;
  }

  // offsetParent チェーンで祖先へ辿れないケースは rect 差分で補正する。
  const elRect = el.getBoundingClientRect();
  const ancestorRect = ancestor.getBoundingClientRect();
  return ancestor.scrollTop + (elRect.top - ancestorRect.top);
}

function isSameFrame(
  left: MinimapFrame | null,
  right: MinimapFrame | null,
): boolean {
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

export const ThreadMinimap: React.FC<ThreadMinimapProps> = ({
  rootRef,
  repIndex,
  responseCount,
  activeTopBar,
  onMarkerClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRafRef = useRef<number | null>(null);
  const markerHitsRef = useRef<MinimapMarkerHit[]>([]);
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

  const getScrollContainer = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }

    const panel = host.closest(".content-area__tab-panel");
    return panel instanceof HTMLElement ? panel : null;
  }, [rootRef]);

  const getResponsesRoot = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }
    const responses = host.querySelector(".thread-page__responses");
    return responses instanceof HTMLElement ? responses : null;
  }, [rootRef]);

  const getTopBarRoot = useCallback((): HTMLElement | null => {
    const host = rootRef.current;
    if (!host) {
      return null;
    }
    const topBar = host.querySelector(".thread-page__top-bar");
    return topBar instanceof HTMLElement ? topBar : null;
  }, [rootRef]);

  const setHostMinimapWidth = useCallback(
    (widthPx: number) => {
      const host = rootRef.current;
      if (!host) {
        return;
      }
      host.style.setProperty(
        "--thread-minimap-width",
        `${Math.max(0, widthPx)}px`,
      );
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
      Math.round(window.innerWidth * MINIMAP_WIDTH_RATIO),
      MINIMAP_MIN_WIDTH,
      MINIMAP_MAX_WIDTH,
    );

    const scrollbarWidth = Math.max(
      0,
      scrollContainer.offsetWidth - scrollContainer.clientWidth,
    );
    // スクロールバーと重なるとドラッグ操作が失敗しやすいので、バー幅ぶん左へ逃がす。
    const preferredLeft = rect.right - scrollbarWidth - width - MINIMAP_GAP;
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
    setHostMinimapWidth(width + MINIMAP_GAP);
  }, [
    activeTopBar,
    getScrollContainer,
    getTopBarRoot,
    responseCount,
    setHostMinimapWidth,
  ]);

  const getMetrics = useCallback((): MinimapMetrics | null => {
    const scrollContainer = getScrollContainer();
    const currentFrame = frame;
    if (!scrollContainer || !currentFrame) {
      return null;
    }

    const scrollHeight = Math.max(scrollContainer.scrollHeight, 1);
    const clientHeight = Math.max(scrollContainer.clientHeight, 1);
    const scale = currentFrame.height / scrollHeight;
    const viewportHeightPx = Math.max(clientHeight * scale, 6);
    const viewportTopPx = scrollContainer.scrollTop * scale;
    const maxViewportTop = Math.max(currentFrame.height - viewportHeightPx, 0);

    return {
      scrollHeight,
      clientHeight,
      scale,
      viewportHeightPx,
      viewportTopPx,
      maxViewportTop,
    };
  }, [frame, getScrollContainer]);

  const draw = useCallback(() => {
    markerHitsRef.current = [];
    const canvas = canvasRef.current;
    const scrollContainer = getScrollContainer();
    const responsesRoot = getResponsesRoot();
    const metrics = getMetrics();
    const currentFrame = frame;
    if (
      !canvas ||
      !scrollContainer ||
      !responsesRoot ||
      !metrics ||
      !currentFrame
    ) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
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

    const responsesTop = getOffsetTopWithinAncestor(
      responsesRoot,
      scrollContainer,
    );
    const minY = 6;
    const maxY = cssHeight - 6;
    const markerX = cssWidth - 6;
    const markerHitRadius = 12;
    const markerHits: MinimapMarkerHit[] = [];

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "bold 12px system-ui, sans-serif";

    for (const [resNum, responders] of repIndex.entries()) {
      const count = responders.size;
      if (count < 3) {
        continue;
      }

      const resEl = responsesRoot.querySelector(`[data-res-num="${resNum}"]`);
      if (!(resEl instanceof HTMLElement) || resEl.offsetHeight === 0) {
        continue;
      }

      const markerHeight = Math.max(resEl.offsetHeight * metrics.scale, 4);
      const centerY =
        (responsesTop + resEl.offsetTop) * metrics.scale + markerHeight / 2;
      const y = clamp(centerY, minY, maxY);

      ctx.fillStyle =
        count >= 5 ? "rgba(220, 40, 40, 0.95)" : "rgba(255, 140, 0, 0.9)";
      ctx.fillText("◀", markerX, y);
      // 実際の三角記号より広い当たり判定を持たせ、細いミニマップでもクリックしやすくする。
      markerHits.push({
        resNum,
        x: markerX,
        y,
        radius: markerHitRadius,
      });
    }
    markerHitsRef.current = markerHits;

    ctx.fillStyle = "rgba(26, 115, 232, 0.28)";
    ctx.fillRect(0, metrics.viewportTopPx, cssWidth, metrics.viewportHeightPx);

    ctx.strokeStyle = "rgba(26, 115, 232, 0.82)";
    ctx.strokeRect(
      0.5,
      metrics.viewportTopPx + 0.5,
      cssWidth - 1,
      Math.max(metrics.viewportHeightPx - 1, 1),
    );

    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);
    ctx.restore();
  }, [frame, getMetrics, getResponsesRoot, getScrollContainer, repIndex]);

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
    drawRafRef.current = window.requestAnimationFrame(() => {
      drawRafRef.current = null;
      draw();
    });
  }, [draw]);

  const scrollByPointer = useCallback(
    (relativeY: number, useDragOffset: boolean) => {
      const scrollContainer = getScrollContainer();
      const metrics = getMetrics();
      if (!scrollContainer || !metrics) {
        return;
      }

      const dragOffset = pointerStateRef.current.dragOffset;
      let viewportTop = useDragOffset
        ? relativeY - dragOffset
        : relativeY - metrics.viewportHeightPx / 2;
      viewportTop = clamp(viewportTop, 0, metrics.maxViewportTop);

      const scrollableRange = metrics.scrollHeight - metrics.clientHeight;
      const ratio =
        metrics.maxViewportTop === 0 ? 0 : viewportTop / metrics.maxViewportTop;
      const targetTop = scrollableRange <= 0 ? 0 : ratio * scrollableRange;

      scrollContainer.scrollTo({ top: targetTop, behavior: "auto" });
    },
    [getMetrics, getScrollContainer],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const metrics = getMetrics();
      const currentFrame = frame;
      if (!metrics || !currentFrame) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const relativeX = event.clientX - currentFrame.left;
      const relativeY = clamp(
        event.clientY - currentFrame.top,
        0,
        currentFrame.height,
      );
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
    [findMarkerByPoint, frame, getMetrics, scrollByPointer],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const currentFrame = frame;
      if (!currentFrame) {
        return;
      }
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
      const relativeY = clamp(
        event.clientY - currentFrame.top,
        0,
        currentFrame.height,
      );
      scrollByPointer(relativeY, true);
    },
    [frame, scrollByPointer],
  );

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
          const relativeY = clamp(
            event.clientY - currentFrame.top,
            0,
            currentFrame.height,
          );
          const moveX = relativeX - pointerStateRef.current.startX;
          const moveY = relativeY - pointerStateRef.current.startY;
          const movedDistanceSq = moveX * moveX + moveY * moveY;
          // 軽微なブレはクリックとして扱い、既存のジャンプ＆ハイライトへ委譲する。
          if (movedDistanceSq <= 144) {
            onMarkerClick(pointerStateRef.current.markerResNum);
          }
        }
      }

      releasePointerState();
    },
    [frame, onMarkerClick, releasePointerState],
  );

  useEffect(() => {
    updateFrame();
  }, [responseCount, updateFrame]);

  useEffect(() => {
    // 描画は frame/返信分布の変化にだけ追従させ、
    // レイアウト計算 effect と分離して再入ループを防ぐ。
    scheduleDraw();
  }, [frame, repIndex, responseCount, scheduleDraw]);

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
    window.addEventListener("resize", onWindowResize);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            updateFrame();
            scheduleDraw();
          })
        : null;
    if (resizeObserver) {
      resizeObserver.observe(scrollContainer);
    }

    return () => {
      scrollContainer.removeEventListener("scroll", onPanelScroll);
      window.removeEventListener("resize", onWindowResize);
      resizeObserver?.disconnect();
    };
  }, [getScrollContainer, scheduleDraw, updateFrame]);

  useEffect(() => {
    return () => {
      if (drawRafRef.current != null) {
        window.cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
      setHostMinimapWidth(0);
      releasePointerState();
    };
  }, [releasePointerState, setHostMinimapWidth]);

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

  if (!frame) {
    return null;
  }

  return (
    <div className="thread-page__minimap" style={style} aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="thread-page__minimap-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
};
