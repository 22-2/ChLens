import { useEffect, useRef } from "react";
import { createLogger } from "src/app/logger";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

import { MANUAL_IMAGE_LOADING_CONFIG_KEY } from "../domain/media-settings";
import { listPreloadUrls } from "./media-viewer-preload";
import type { ViewerState } from "./media-viewer-types";

const logger = createLogger("media");

interface NetworkInformationLike {
  saveData?: boolean;
}

function isDataSaverEnabled(win: Window): boolean {
  const connection = (win.navigator as Navigator & { connection?: NetworkInformationLike })
    .connection;
  return connection?.saveData === true;
}

/**
 * ビューアで表示中の画像の前後を、現在の画像の読み込み完了後に1件ずつ先読みする。
 * 変更理由: 画像を切り替えるたびの読み込み待ちを減らす。手動読み込み設定とデータセーバー
 * では通信を増やさないよう先読みしない。別窓のビューアも同じフックを通るため同じ挙動になる。
 */
export function useMediaViewerPreload(
  viewer: ViewerState | null,
  isLoading: boolean,
  viewWindow: Window,
): void {
  const { value: manualImageLoading } = useConfigBooleanSetting(MANUAL_IMAGE_LOADING_CONFIG_KEY);
  const preloadedRef = useRef<Set<string>>(new Set());
  const images = viewer?.images;
  const currentIndex = viewer?.currentIndex;
  const isOpen = viewer != null;

  useEffect(() => {
    // ビューアを閉じたら、次に開いたときに別の画像群を扱えるよう記録を捨てる。
    if (!isOpen) preloadedRef.current.clear();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isLoading || manualImageLoading || isDataSaverEnabled(viewWindow)) return;
    const queue = listPreloadUrls(images, currentIndex).filter(
      (url) => !preloadedRef.current.has(url),
    );
    if (queue.length === 0) return;

    let cancelled = false;
    let active: HTMLImageElement | null = null;
    const loadNext = () => {
      const url = queue.shift();
      if (cancelled || url == null) return;
      const image = viewWindow.document.createElement("img");
      active = image;
      image.onload = () => {
        preloadedRef.current.add(url);
        loadNext();
      };
      image.onerror = () => {
        // 失敗しても表示には出さない。本表示のときに通常どおり読み込まれる。
        logger.warn("画像の先読みに失敗しました", { url });
        loadNext();
      };
      image.src = url;
    };
    loadNext();

    return () => {
      // 画像の切り替えやビューアの終了では、読み込み中の先読みを中断する。
      cancelled = true;
      if (active) {
        active.onload = null;
        active.onerror = null;
        active.src = "";
      }
    };
  }, [currentIndex, images, isLoading, isOpen, manualImageLoading, viewWindow]);
}
