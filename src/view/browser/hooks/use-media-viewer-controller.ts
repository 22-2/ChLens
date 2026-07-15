import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { useMediaViewerStore } from "src/view/browser/hooks/use-media-viewer-store";
import type { ViewerState } from "src/view/browser/utils/types";

interface ViewerSize {
  width: number;
  height: number;
}

interface ViewerPoint {
  x: number;
  y: number;
}

export interface MediaViewerProps {
  viewer: ViewerState;
  viewerStageRef: RefObject<HTMLDivElement | null>;
  viewerCanvasRef: RefObject<HTMLDivElement | null>;
  viewerImageRef: RefObject<HTMLImageElement | null>;
  canNavigateViewerPrev: boolean;
  canNavigateViewerNext: boolean;
  isMaximized: boolean;
  isLoading: boolean;
  onOverlayClick: () => void;
  onChromeClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onSave: () => void;
  onClose: () => void;
  onToggleMaximize: () => void;
  onImageLoad: () => void;
}

function sanitizeDownloadFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

function getViewerDownloadFilename(url: string): string {
  try {
    const parsed = new window.URL(url);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).at(-1);
    if (lastSegment) {
      return sanitizeDownloadFilename(lastSegment);
    }
  } catch {
    // URL パース失敗時は fallback 名で保存する。
  }

  return "image";
}

function getViewerStageViewportSize(stage: HTMLDivElement): ViewerSize {
  const styles = window.getComputedStyle(stage);
  const borderX =
    Number.parseFloat(styles.borderLeftWidth || "0") +
    Number.parseFloat(styles.borderRightWidth || "0");
  const borderY =
    Number.parseFloat(styles.borderTopWidth || "0") +
    Number.parseFloat(styles.borderBottomWidth || "0");

  // border-box 基準で安定したサイズを取り、スクロールバー由来の揺れを避ける。
  const rect = stage.getBoundingClientRect();

  return {
    width: Math.max(1, Math.round(rect.width - borderX)),
    height: Math.max(1, Math.round(rect.height - borderY)),
  };
}

function isSameViewerSize(current: ViewerSize | null, next: ViewerSize): boolean {
  return current?.width === next.width && current?.height === next.height;
}

function getViewerStageCenter(size: ViewerSize): ViewerPoint {
  return { x: size.width / 2, y: size.height / 2 };
}

function roundViewerDistance(value: number): number {
  return Number(value.toFixed(2));
}

function roundViewerScale(value: number): number {
  return Number(value.toFixed(4));
}

function getPointWithinStage(stage: HTMLDivElement, clientX: number, clientY: number): ViewerPoint {
  const rect = stage.getBoundingClientRect();
  const styles = window.getComputedStyle(stage);
  const borderLeft = Number.parseFloat(styles.borderLeftWidth || "0");
  const borderTop = Number.parseFloat(styles.borderTopWidth || "0");

  return {
    x: clientX - rect.left - borderLeft,
    y: clientY - rect.top - borderTop,
  };
}

export function useMediaViewerController(): MediaViewerProps | null {
  const viewer = useMediaViewerStore((state) => state.viewer);
  const viewerScale = useMediaViewerStore((state) => state.viewerScale);
  const isLoading = useMediaViewerStore((state) => state.isLoading);
  const closeViewer = useMediaViewerStore((state) => state.closeViewer);
  const navigateViewer = useMediaViewerStore((state) => state.navigateViewer);
  const zoomIn = useMediaViewerStore((state) => state.zoomIn);
  const zoomOut = useMediaViewerStore((state) => state.zoomOut);
  const resetScale = useMediaViewerStore((state) => state.resetScale);
  const zoomByWheel = useMediaViewerStore((state) => state.zoomByWheel);
  const setImageLoading = useMediaViewerStore((state) => state.setImageLoading);

  // ビューポートの最大化状態をローカルで管理する。
  // viewer が閉じて再開した時にリセットが必要なので useEffect で監視する。
  const [isMaximized, setIsMaximized] = useState(false);

  const viewerStageRef = useRef<HTMLDivElement>(null);
  const viewerCanvasRef = useRef<HTMLDivElement>(null);
  const viewerImageRef = useRef<HTMLImageElement>(null);
  const viewerBaseSizeRef = useRef<ViewerSize | null>(null);
  const viewerStageSizeRef = useRef<ViewerSize | null>(null);
  const viewerPanRef = useRef<ViewerPoint>({ x: 0, y: 0 });
  const viewerDisplayScaleRef = useRef(1);
  const viewerTargetScaleRef = useRef(1);
  const zoomPivotRef = useRef<ViewerPoint | null>(null);
  const zoomAnimationFrameRef = useRef<number | null>(null);
  const middlePanStateRef = useRef<{
    active: boolean;
    startPointer: ViewerPoint;
    startPan: ViewerPoint;
  }>({
    active: false,
    startPointer: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
  });

  const renderViewerTransform = useCallback(() => {
    const canvas = viewerCanvasRef.current;
    const baseSize = viewerBaseSizeRef.current;
    if (!canvas || !baseSize) {
      return;
    }

    // 微小な浮動小数の揺れを丸めて style 文字列の差分を減らし、
    // 狭幅時の無駄な DOM commit を抑える。
    const panX = roundViewerDistance(viewerPanRef.current.x);
    const panY = roundViewerDistance(viewerPanRef.current.y);
    const scale = roundViewerScale(viewerDisplayScaleRef.current);

    canvas.style.width = `${baseSize.width}px`;
    canvas.style.height = `${baseSize.height}px`;
    canvas.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
  }, []);

  const stopZoomAnimation = useCallback(() => {
    if (zoomAnimationFrameRef.current != null) {
      window.cancelAnimationFrame(zoomAnimationFrameRef.current);
      zoomAnimationFrameRef.current = null;
    }
  }, []);

  const centerViewer = useCallback((stageSize: ViewerSize, baseSize: ViewerSize) => {
    const scale = viewerDisplayScaleRef.current;
    const stageCenter = getViewerStageCenter(stageSize);
    viewerPanRef.current = {
      x: stageCenter.x - (baseSize.width * scale) / 2,
      y: stageCenter.y - (baseSize.height * scale) / 2,
    };
  }, []);

  const measureViewerLayout = useCallback(() => {
    const stage = viewerStageRef.current;
    const image = viewerImageRef.current;
    if (
      !stage ||
      !image ||
      // img.src が切り替わった直後は前の画像の naturalWidth/naturalHeight が残っていることがある。
      // image.complete が false の間は旧画像の寸法で誤ったレイアウトを組んでしまうため、
      // 必ず読み込み完了（onLoad 発火済み）を確認してから計算する。
      !image.complete ||
      image.naturalWidth <= 0 ||
      image.naturalHeight <= 0
    ) {
      return;
    }

    const nextStageSize = getViewerStageViewportSize(stage);
    const fitRatio = Math.min(
      1,
      nextStageSize.width / image.naturalWidth,
      nextStageSize.height / image.naturalHeight,
    );

    const nextBaseSize: ViewerSize = {
      width: Math.max(1, Math.round(image.naturalWidth * fitRatio)),
      height: Math.max(1, Math.round(image.naturalHeight * fitRatio)),
    };

    const previousStageSize = viewerStageSizeRef.current;
    const previousBaseSize = viewerBaseSizeRef.current;

    if (
      isSameViewerSize(previousStageSize, nextStageSize) &&
      isSameViewerSize(previousBaseSize, nextBaseSize)
    ) {
      renderViewerTransform();
      return;
    }

    viewerStageSizeRef.current = nextStageSize;
    viewerBaseSizeRef.current = nextBaseSize;

    if (!previousStageSize || !previousBaseSize) {
      viewerDisplayScaleRef.current = viewerTargetScaleRef.current;
      centerViewer(nextStageSize, nextBaseSize);
      renderViewerTransform();
      return;
    }

    // リサイズ時は viewport 中央に見えていた画像上の点を維持し、
    // 半画面化や分割表示でも「勝手に別の場所へ飛ぶ」違和感を減らす。
    const previousStageCenter = getViewerStageCenter(previousStageSize);
    const nextStageCenter = getViewerStageCenter(nextStageSize);
    const scaledPreviousWidth = previousBaseSize.width * viewerDisplayScaleRef.current;
    const scaledPreviousHeight = previousBaseSize.height * viewerDisplayScaleRef.current;
    const focusRatioX =
      scaledPreviousWidth > 0
        ? (previousStageCenter.x - viewerPanRef.current.x) / scaledPreviousWidth
        : 0.5;
    const focusRatioY =
      scaledPreviousHeight > 0
        ? (previousStageCenter.y - viewerPanRef.current.y) / scaledPreviousHeight
        : 0.5;

    viewerPanRef.current = {
      x: nextStageCenter.x - focusRatioX * nextBaseSize.width * viewerDisplayScaleRef.current,
      y: nextStageCenter.y - focusRatioY * nextBaseSize.height * viewerDisplayScaleRef.current,
    };
    renderViewerTransform();
  }, [centerViewer, renderViewerTransform]);

  const animateZoom = useCallback(() => {
    const stageSize = viewerStageSizeRef.current;
    const baseSize = viewerBaseSizeRef.current;
    if (!stageSize || !baseSize) {
      zoomAnimationFrameRef.current = null;
      return;
    }

    const currentScale = viewerDisplayScaleRef.current;
    const targetScale = viewerTargetScaleRef.current;
    if (Math.abs(targetScale - currentScale) < 0.001) {
      viewerDisplayScaleRef.current = targetScale;
      renderViewerTransform();
      zoomAnimationFrameRef.current = null;
      return;
    }

    const zoomPivot = zoomPivotRef.current ?? getViewerStageCenter(stageSize);
    const pivotImageX = (zoomPivot.x - viewerPanRef.current.x) / currentScale;
    const pivotImageY = (zoomPivot.y - viewerPanRef.current.y) / currentScale;
    const nextScale = currentScale + (targetScale - currentScale) * 0.15;

    viewerDisplayScaleRef.current = nextScale;
    viewerPanRef.current = {
      x: zoomPivot.x - pivotImageX * nextScale,
      y: zoomPivot.y - pivotImageY * nextScale,
    };
    renderViewerTransform();
    zoomAnimationFrameRef.current = window.requestAnimationFrame(animateZoom);
  }, [renderViewerTransform]);

  const startZoomAnimation = useCallback(() => {
    stopZoomAnimation();
    zoomAnimationFrameRef.current = window.requestAnimationFrame(animateZoom);
  }, [animateZoom, stopZoomAnimation]);

  const setZoomPivotToStageCenter = useCallback(() => {
    const stageSize = viewerStageSizeRef.current;
    if (!stageSize) {
      return;
    }
    zoomPivotRef.current = getViewerStageCenter(stageSize);
  }, []);

  const resetViewerSurface = useCallback(() => {
    stopZoomAnimation();
    viewerBaseSizeRef.current = null;
    viewerStageSizeRef.current = null;
    viewerPanRef.current = { x: 0, y: 0 };
    viewerDisplayScaleRef.current = 1;
    viewerTargetScaleRef.current = 1;
    zoomPivotRef.current = null;
    middlePanStateRef.current = {
      active: false,
      startPointer: { x: 0, y: 0 },
      startPan: { x: 0, y: 0 },
    };

    viewerStageRef.current?.classList.remove("media-viewer__stage--panning");

    const canvas = viewerCanvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.style.removeProperty("width");
    canvas.style.removeProperty("height");
    canvas.style.removeProperty("transform");
  }, [stopZoomAnimation]);

  useLayoutEffect(() => {
    // src 切り替え直後の1フレームで旧transformが見えると拡大ちらつきになるため、
    // paint前にサーフェス状態を初期化してから次画像の描画に入る。
    resetViewerSurface();
  }, [resetViewerSurface, viewer?.src]);

  // 左右移動で viewer.src が変わるたびに解除すると操作体験が崩れるため、
  // 最大化状態はビューアを閉じたタイミングだけ初期化する。
  useEffect(() => {
    if (!viewer) {
      setIsMaximized(false);
    }
  }, [viewer]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const stage = viewerStageRef.current;
    if (!stage) {
      return;
    }

    measureViewerLayout();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        measureViewerLayout();
      });
      observer.observe(stage);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measureViewerLayout);
    return () => window.removeEventListener("resize", measureViewerLayout);
  }, [measureViewerLayout, viewer]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    viewerTargetScaleRef.current = viewerScale;
    if (!viewerBaseSizeRef.current || !viewerStageSizeRef.current) {
      return;
    }

    if (!zoomPivotRef.current) {
      setZoomPivotToStageCenter();
    }
    startZoomAnimation();
  }, [setZoomPivotToStageCenter, startZoomAnimation, viewer, viewerScale]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeViewer();
      } else if (event.key === "ArrowLeft") {
        navigateViewer(-1);
      } else if (event.key === "ArrowRight") {
        navigateViewer(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeViewer, navigateViewer, viewer]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const stage = viewerStageRef.current;
    if (!stage) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomPivotRef.current = getPointWithinStage(stage, event.clientX, event.clientY);
      zoomByWheel(event.deltaY, event.deltaMode);
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [viewer, zoomByWheel]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const stage = viewerStageRef.current;
    if (!stage) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 && event.button !== 1) {
        return;
      }

      event.preventDefault();
      stopZoomAnimation();
      middlePanStateRef.current = {
        active: true,
        startPointer: { x: event.clientX, y: event.clientY },
        startPan: { ...viewerPanRef.current },
      };
      stage.classList.add("media-viewer__stage--panning");
    };

    const onMouseMove = (event: globalThis.MouseEvent) => {
      if (!middlePanStateRef.current.active) {
        return;
      }

      viewerPanRef.current = {
        x:
          middlePanStateRef.current.startPan.x +
          (event.clientX - middlePanStateRef.current.startPointer.x),
        y:
          middlePanStateRef.current.startPan.y +
          (event.clientY - middlePanStateRef.current.startPointer.y),
      };
      renderViewerTransform();
    };

    const onMouseUp = (event: globalThis.MouseEvent) => {
      if ((event.button !== 0 && event.button !== 1) || !middlePanStateRef.current.active) {
        return;
      }

      middlePanStateRef.current.active = false;
      stage.classList.remove("media-viewer__stage--panning");
    };

    stage.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      stage.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      stage.classList.remove("media-viewer__stage--panning");
    };
  }, [renderViewerTransform, stopZoomAnimation, viewer]);

  useEffect(() => () => stopZoomAnimation(), [stopZoomAnimation]);

  if (!viewer) {
    return null;
  }

  const saveViewerImage = async () => {
    try {
      // download 属性だけだと cross-origin 画像で保存名が落ちやすいので、
      // blob 化して拡張ページ側から保存トリガーを作る。
      const response = await fetch(viewer.src);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = getViewerDownloadFilename(viewer.src);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => {
        window.URL.revokeObjectURL(objectUrl);
      }, 0);
    } catch (error) {
      console.error(error);
      window.open(viewer.src, "_blank", "noopener,noreferrer");
    }
  };

  return {
    viewer,
    viewerStageRef,
    viewerCanvasRef,
    viewerImageRef,
    canNavigateViewerPrev: !!viewer.images && (viewer.currentIndex ?? 0) > 0,
    canNavigateViewerNext: !!viewer.images && (viewer.currentIndex ?? 0) < viewer.images.length - 1,
    isLoading,
    onOverlayClick: closeViewer,
    onChromeClick: (event) => event.stopPropagation(),
    onNavigatePrev: () => navigateViewer(-1),
    onNavigateNext: () => navigateViewer(1),
    onZoomOut: () => {
      setZoomPivotToStageCenter();
      zoomOut();
    },
    onZoomReset: () => {
      setZoomPivotToStageCenter();
      resetScale();
    },
    onZoomIn: () => {
      setZoomPivotToStageCenter();
      zoomIn();
    },
    onSave: () => {
      void saveViewerImage();
    },
    isMaximized,
    onClose: closeViewer,
    onToggleMaximize: () => setIsMaximized((prev) => !prev),
    onImageLoad: () => {
      setImageLoading(false);
      measureViewerLayout();
    },
  };
}
