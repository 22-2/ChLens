import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import type { ViewerState } from "src/view/browser/utils/types";
import { useMediaViewerStore } from "src/view/browser/hooks/use-media-viewer-store";

interface ViewerSize {
  width: number;
  height: number;
}

export interface MediaViewerProps {
  viewer: ViewerState;
  viewerStageRef: RefObject<HTMLDivElement | null>;
  viewerImageRef: RefObject<HTMLImageElement | null>;
  viewerCanvasSize: ViewerSize | null;
  viewerRenderedSize: ViewerSize | null;
  canNavigateViewerPrev: boolean;
  canNavigateViewerNext: boolean;
  onOverlayClick: () => void;
  onChromeClick: (event: MouseEvent<HTMLDivElement>) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onClose: () => void;
  onImageLoad: () => void;
}

function getViewerStageViewportSize(stage: HTMLDivElement): ViewerSize {
  const styles = window.getComputedStyle(stage);
  const paddingX =
    Number.parseFloat(styles.paddingLeft || "0") +
    Number.parseFloat(styles.paddingRight || "0");
  const paddingY =
    Number.parseFloat(styles.paddingTop || "0") +
    Number.parseFloat(styles.paddingBottom || "0");

  return {
    width: Math.max(1, Math.round(stage.clientWidth - paddingX)),
    height: Math.max(1, Math.round(stage.clientHeight - paddingY)),
  };
}

export function useMediaViewerController(): MediaViewerProps | null {
  const viewer = useMediaViewerStore((state) => state.viewer);
  const viewerScale = useMediaViewerStore((state) => state.viewerScale);
  const closeViewer = useMediaViewerStore((state) => state.closeViewer);
  const navigateViewer = useMediaViewerStore((state) => state.navigateViewer);
  const zoomIn = useMediaViewerStore((state) => state.zoomIn);
  const zoomOut = useMediaViewerStore((state) => state.zoomOut);
  const resetScale = useMediaViewerStore((state) => state.resetScale);
  const zoomByWheel = useMediaViewerStore((state) => state.zoomByWheel);

  const viewerStageRef = useRef<HTMLDivElement>(null);
  const viewerImageRef = useRef<HTMLImageElement>(null);
  const previousViewerCanvasSizeRef = useRef<ViewerSize | null>(null);
  const [viewerBaseSize, setViewerBaseSize] = useState<ViewerSize | null>(null);
  const [viewerStageSize, setViewerStageSize] = useState<ViewerSize | null>(null);

  const measureViewerLayout = useCallback(() => {
    const stage = viewerStageRef.current;
    const image = viewerImageRef.current;
    if (!stage || !image || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return;
    }

    const nextStageSize = getViewerStageViewportSize(stage);
    const fitRatio = Math.min(
      1,
      nextStageSize.width / image.naturalWidth,
      nextStageSize.height / image.naturalHeight,
    );

    setViewerStageSize(nextStageSize);
    // transform だけで拡大するとスクロール領域が拡大されず操作感が崩れるため、
    // fit 後の実レイアウトサイズを基準にして描画サイズを更新する。
    setViewerBaseSize({
      width: Math.max(1, Math.round(image.naturalWidth * fitRatio)),
      height: Math.max(1, Math.round(image.naturalHeight * fitRatio)),
    });
  }, []);

  useEffect(() => {
    setViewerBaseSize(null);
    setViewerStageSize(null);
    previousViewerCanvasSizeRef.current = null;
  }, [viewer?.src]);

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

  const viewerRenderedSize = useMemo(() => {
    if (!viewerBaseSize) {
      return null;
    }

    return {
      width: Math.max(1, Math.round(viewerBaseSize.width * viewerScale)),
      height: Math.max(1, Math.round(viewerBaseSize.height * viewerScale)),
    } satisfies ViewerSize;
  }, [viewerBaseSize, viewerScale]);

  const viewerCanvasSize = useMemo(() => {
    if (!viewerRenderedSize) {
      return null;
    }

    return {
      width: Math.max(viewerStageSize?.width ?? 0, viewerRenderedSize.width),
      height: Math.max(viewerStageSize?.height ?? 0, viewerRenderedSize.height),
    } satisfies ViewerSize;
  }, [viewerRenderedSize, viewerStageSize]);

  useLayoutEffect(() => {
    if (!viewer || !viewerCanvasSize) {
      return;
    }

    const stage = viewerStageRef.current;
    if (!stage) {
      return;
    }

    const previousCanvasSize = previousViewerCanvasSizeRef.current;
    if (!previousCanvasSize) {
      stage.scrollLeft = Math.max(0, (viewerCanvasSize.width - stage.clientWidth) / 2);
      stage.scrollTop = Math.max(0, (viewerCanvasSize.height - stage.clientHeight) / 2);
      previousViewerCanvasSizeRef.current = viewerCanvasSize;
      return;
    }

    const viewportCenterX = stage.scrollLeft + stage.clientWidth / 2;
    const viewportCenterY = stage.scrollTop + stage.clientHeight / 2;
    const scaleRatioX = viewerCanvasSize.width / previousCanvasSize.width;
    const scaleRatioY = viewerCanvasSize.height / previousCanvasSize.height;

    stage.scrollLeft = Math.max(0, viewportCenterX * scaleRatioX - stage.clientWidth / 2);
    stage.scrollTop = Math.max(0, viewportCenterY * scaleRatioY - stage.clientHeight / 2);
    previousViewerCanvasSizeRef.current = viewerCanvasSize;
  }, [viewer, viewerCanvasSize]);

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
      zoomByWheel(event.deltaY);
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [viewer, zoomByWheel]);

  if (!viewer) {
    return null;
  }

  return {
    viewer,
    viewerStageRef,
    viewerImageRef,
    viewerCanvasSize,
    viewerRenderedSize,
    canNavigateViewerPrev: !!viewer.images && (viewer.currentIndex ?? 0) > 0,
    canNavigateViewerNext:
      !!viewer.images && (viewer.currentIndex ?? 0) < viewer.images.length - 1,
    onOverlayClick: closeViewer,
    onChromeClick: (event) => event.stopPropagation(),
    onNavigatePrev: () => navigateViewer(-1),
    onNavigateNext: () => navigateViewer(1),
    onZoomOut: zoomOut,
    onZoomReset: resetScale,
    onZoomIn: zoomIn,
    onClose: closeViewer,
    onImageLoad: measureViewerLayout,
  };
}
