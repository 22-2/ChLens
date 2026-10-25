import { ExternalLink, Undo2 } from "lucide-react";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useExternalLinkMenu } from "src/view/browser/hooks/use-external-link-menu";
import { ConfirmableLink } from "src/view/browser/ui/ConfirmableLink";
import { Spinner } from "src/view/browser/ui/Spinner";
import { EXTERNAL_LINK_CONFIRM_CONFIG_KEY } from "src/view/browser/utils/external-link-analysis";

import type { MediaViewerProps } from "../browser/use-media-viewer-controller";
import { ExternalImage } from "./ExternalImage";

interface MediaViewerWindowProps {
  isDetached: boolean;
  onDetach: () => void;
  onAttach: () => void;
}

export function MediaViewer({
  viewer,
  viewerStageRef,
  viewerCanvasRef,
  viewerImageRef,
  canNavigateViewerPrev,
  canNavigateViewerNext,
  isLoading,
  onOverlayClick,
  onChromeClick,
  onNavigatePrev,
  onNavigateNext,
  onSave,
  canDeleteImage,
  onDeleteImage,
  onClose,
  isDetached,
  onDetach,
  onAttach,
  onImageLoad,
  onImageError,
}: MediaViewerProps & MediaViewerWindowProps) {
  const { value: confirmExternal } = useConfigBooleanSetting(EXTERNAL_LINK_CONFIRM_CONFIG_KEY);
  const { openMenu, menu } = useExternalLinkMenu();
  return (
    <>
      <div
        className={`media-viewer${isDetached ? " media-viewer--detached" : ""}`}
        onMouseDown={(event) => {
          // ビューアをポップアップ内から開いた場合も、オーバーレイのクリックを
          // 背後のポップアップに対する outside click として扱わせない。
          event.stopPropagation();
        }}
        onClick={onOverlayClick}
        onContextMenu={(event) => {
          if (confirmExternal) openMenu(viewer.label, event);
        }}
      >
        <div className="media-viewer__chrome" onClick={onChromeClick}>
          <div className="media-viewer__toolbar">
            <span className="media-viewer__label">{viewer.label}</span>
            <div className="media-viewer__actions">
              <ConfirmableLink
                href={viewer.label}
                target="_blank"
                rel="noopener noreferrer"
                className="media-viewer__btn"
              >
                ブラウザで開く
              </ConfirmableLink>
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
              {/* 変更理由: ズームは画像上のホイール操作に統一し、ツールバーのボタン数を減らす。 */}
              <button
                type="button"
                className="media-viewer__btn"
                onClick={isDetached ? onAttach : onDetach}
                title={isDetached ? "元の画面に戻す" : "別窓へ切り離す"}
                aria-label={isDetached ? "元の画面に戻す" : "別窓へ切り離す"}
              >
                {isDetached ? <Undo2 size={16} /> : <ExternalLink size={16} />}
              </button>
              <button type="button" className="media-viewer__btn" onClick={onSave} title="保存">
                保存
              </button>
              {/* 変更理由: 削除キーを持つこのアプリの投稿画像だけ削除を出し、他人の画像に操作を出さない。 */}
              {canDeleteImage && (
                <button
                  type="button"
                  className="media-viewer__btn"
                  onClick={onDeleteImage}
                  title="Imgurから削除"
                >
                  削除
                </button>
              )}
              <button
                type="button"
                className="media-viewer__btn media-viewer__close"
                onClick={onClose}
                title="閉じる"
              >
                ✕
              </button>
            </div>
          </div>

          <div ref={viewerStageRef} className="media-viewer__stage">
            {isLoading && (
              <div className="media-viewer__loader">
                <Spinner size="lg" />
              </div>
            )}
            <div ref={viewerCanvasRef} className="media-viewer__canvas">
              <ExternalImage
                ref={viewerImageRef}
                className="media-viewer__image"
                src={viewer.src}
                alt={viewer.label}
                manualLoad={false}
                onLoad={onImageLoad}
                onError={onImageError}
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
      {confirmExternal && menu}
    </>
  );
}
