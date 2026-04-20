import type { MediaViewerProps } from "src/view/browser/hooks/use-media-viewer-controller";

export function MediaViewer({
  viewer,
  viewerStageRef,
  viewerImageRef,
  viewerCanvasSize,
  viewerRenderedSize,
  canNavigateViewerPrev,
  canNavigateViewerNext,
  onOverlayClick,
  onChromeClick,
  onNavigatePrev,
  onNavigateNext,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onClose,
  onImageLoad,
}: MediaViewerProps): JSX.Element {
  return (
    <div className="media-viewer" onClick={onOverlayClick}>
      <div className="media-viewer__chrome" onClick={onChromeClick}>
        <div className="media-viewer__toolbar">
          <span className="media-viewer__label">{viewer.label}</span>
          <div className="media-viewer__actions">
            {viewer.images && viewer.images.length > 1 && (
              <>
                <button
                  type="button"
                  className="media-viewer__btn"
                  disabled={!canNavigateViewerPrev}
                  onClick={onNavigatePrev}
                  title="前の画像"
                >
                  ←
                </button>
                <span className="media-viewer__nav-pos">
                  {(viewer.currentIndex ?? 0) + 1}/{viewer.images.length}
                </span>
                <button
                  type="button"
                  className="media-viewer__btn"
                  disabled={!canNavigateViewerNext}
                  onClick={onNavigateNext}
                  title="次の画像"
                >
                  →
                </button>
              </>
            )}
            <button
              type="button"
              className="media-viewer__btn"
              onClick={onZoomOut}
              title="縮小"
            >
              -
            </button>
            <button
              type="button"
              className="media-viewer__btn"
              onClick={onZoomReset}
              title="等倍"
            >
              100%
            </button>
            <button
              type="button"
              className="media-viewer__btn"
              onClick={onZoomIn}
              title="拡大"
            >
              +
            </button>
            <button
              type="button"
              className="media-viewer__btn"
              onClick={onClose}
              title="閉じる"
            >
              ✕
            </button>
          </div>
        </div>

        <div ref={viewerStageRef} className="media-viewer__stage">
          <div
            className="media-viewer__canvas"
            style={
              viewerCanvasSize
                ? {
                    width: `${viewerCanvasSize.width}px`,
                    height: `${viewerCanvasSize.height}px`,
                  }
                : undefined
            }
          >
            <img
              ref={viewerImageRef}
              className="media-viewer__image"
              src={viewer.src}
              alt={viewer.label}
              onLoad={onImageLoad}
              style={
                viewerRenderedSize
                  ? {
                      width: `${viewerRenderedSize.width}px`,
                      height: `${viewerRenderedSize.height}px`,
                      maxWidth: "none",
                      maxHeight: "none",
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
