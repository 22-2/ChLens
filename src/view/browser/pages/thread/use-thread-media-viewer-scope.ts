import { useCallback } from "react";
import {
  getThreadMediaViewerScopeId,
  useMediaViewerStore,
} from "src/features/media/browser/use-media-viewer-store";

/** スレッドごとに画像ビューアを分けるための識別子と、本文から画像を開く関数を返す。 */
export function useThreadMediaViewerScope(tabId: string, threadUrl: string) {
  const mediaViewerScopeId = getThreadMediaViewerScopeId(tabId, threadUrl);
  const openMedia = useMediaViewerStore((state) => state.openMediaFromUrl);
  const openMediaFromUrl = useCallback(
    (url: string, resImages?: string[], resSaveImages?: string[]) => {
      // 変更理由: 画像ビューアーのストアは画面全体で共有されるため、
      // 開いたスレッドを識別して、別スレッドの破棄処理が表示中の画像へ影響しないようにする。
      if (resSaveImages) {
        openMedia(url, resImages, mediaViewerScopeId, resSaveImages);
      } else {
        openMedia(url, resImages, mediaViewerScopeId);
      }
    },
    [mediaViewerScopeId, openMedia],
  );
  return { mediaViewerScopeId, openMediaFromUrl };
}
