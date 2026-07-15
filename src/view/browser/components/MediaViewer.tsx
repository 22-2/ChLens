import { Loader } from "@mantine/core";
import { Maximize, Minimize } from "lucide-react";
import type { MediaViewerProps } from "src/view/browser/hooks/use-media-viewer-controller";

export function MediaViewer({
  viewer,
  viewerStageRef,
  viewerCanvasRef,
  viewerImageRef,
  canNavigateViewerPrev,
  canNavigateViewerNext,
  isMaximized,
  isLoading,
  onOverlayClick,
  onChromeClick,
  onNavigatePrev,
  onNavigateNext,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onSave,
  onClose,
  onToggleMaximize,
  onImageLoad,
}: MediaViewerProps) {
  return (
    <div className="media-viewer" onClick={onOverlayClick}>
      <div
        className={`media-viewer__chrome${isMaximized ? " media-viewer__chrome--maximized" : ""}`}
        onClick={onChromeClick}
      >
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
            <button type="button" className="media-viewer__btn" onClick={onZoomOut} title="縮小">
              -
            </button>
            <button type="button" className="media-viewer__btn" onClick={onZoomReset} title="等倍">
              100%
            </button>
            <button type="button" className="media-viewer__btn" onClick={onZoomIn} title="拡大">
              +
            </button>
            <button
              type="button"
              className="media-viewer__btn"
              onClick={onToggleMaximize}
              title={isMaximized ? "元のサイズに戻す" : "最大化"}
            >
              {isMaximized ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
            <button type="button" className="media-viewer__btn" onClick={onSave} title="保存">
              保存
            </button>
            <button type="button" className="media-viewer__btn" onClick={onClose} title="閉じる">
              ✕
            </button>
          </div>
        </div>

        <div ref={viewerStageRef} className="media-viewer__stage">
          {isLoading && (
            <div className="media-viewer__loader">
              <Loader size="lg" />
            </div>
          )}
          <div ref={viewerCanvasRef} className="media-viewer__canvas">
            <img
              ref={viewerImageRef}
              className="media-viewer__image"
              src={viewer.src}
              alt={viewer.label}
              onLoad={onImageLoad}
              draggable={false}
              style={{
                // 画像切り替え時は即座に不可視化し、前画像がフェードアウトで見えるちらつきを防ぐ。
                opacity: isLoading ? 0 : 1,
                visibility: isLoading ? "hidden" : "visible",
                transition: isLoading ? "none" : "opacity 0.2s ease",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
