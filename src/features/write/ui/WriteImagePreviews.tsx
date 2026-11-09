import React, { useMemo } from "react";
import { extractUrlsFromMessage, toViewerImageUrl } from "src/core/util/url-media";
import { useMediaViewerStore } from "src/features/media/browser/use-media-viewer-store";
import { MANUAL_IMAGE_LOADING_CONFIG_KEY } from "src/features/media/domain/media-settings";
import { ExternalImage } from "src/features/media/ui/ExternalImage";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

interface WriteImagePreviewsProps {
  message: string;
  /** サムネイルから開くビューアの範囲。投稿先スレごとに分けて、前後移動を本文の画像に限る。 */
  mediaViewerScopeId: string;
}

/** 本文内の画像URLをサムネイルで並べ、選んだ画像を既存のメディアビューアで開く。 */
export const WriteImagePreviews: React.FC<WriteImagePreviewsProps> = ({
  message,
  mediaViewerScopeId,
}) => {
  const { value: manualImageLoading } = useConfigBooleanSetting(MANUAL_IMAGE_LOADING_CONFIG_KEY);
  const openMedia = useMediaViewerStore((state) => state.openMediaFromUrl);
  // 変更理由: 投稿前の本文から画像だけを既存ビューアへ渡し、URLの復元や
  // 複数画像の前後移動をレス表示と同じ規則で利用できるようにする。
  const previewImages = useMemo(
    () => extractUrlsFromMessage(message).filter((url) => toViewerImageUrl(url)),
    [message],
  );
  if (previewImages.length === 0) return null;

  return (
    <div className="write-panel__image-previews" role="group" aria-label="投稿画像のプレビュー">
      {/* 変更理由: 本文内の画像を投稿前に見分けて選べるよう、サムネイルから
          選んだ画像を開き、ビューアでは本文順に前後移動できるようにする。 */}
      {previewImages.map((url, index) => (
        <button
          key={url}
          type="button"
          className="write-panel__image-preview"
          aria-label={`画像${index + 1}をプレビュー`}
          title={url}
          onClick={() => openMedia(url, previewImages, mediaViewerScopeId)}
        >
          {manualImageLoading ? (
            <span className="external-image-placeholder">クリックして画像をプレビュー</span>
          ) : (
            <ExternalImage
              src={toViewerImageUrl(url) ?? url}
              alt=""
              loading="lazy"
              manualLoad={false}
              insideControl
            />
          )}
        </button>
      ))}
    </div>
  );
};
