import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useMediaImageStore } from "src/features/media/browser/use-media-image-store";
import {
  getThreadMediaViewerScopeId,
  useMediaViewerStore,
} from "src/features/media/browser/use-media-viewer-store";
import { MANUAL_IMAGE_LOADING_CONFIG_KEY } from "src/features/media/domain/media-settings";
import { ExternalImage } from "src/features/media/ui/ExternalImage";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { collectThreadImages } from "src/view/browser/shell/side-panel-images";
import { useThreadSnapshots } from "src/view/browser/state/thread-snapshot";
import type { ThreadPage } from "src/view/browser/types";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";

type TileStyle = CSSProperties & { "--res-thumb-blur-radius"?: string };

export function SidePanelImages({ tabId, page }: { tabId: string; page: ThreadPage }) {
  const snapshot = useThreadSnapshots((store) => store.entries.get(tabId)?.snapshot);
  const data = snapshot?.threadUrl === page.threadUrl ? snapshot : undefined;
  const { value: manualImageLoading } = useConfigBooleanSetting(MANUAL_IMAGE_LOADING_CONFIG_KEY);
  const imageStates = useMediaImageStore((store) => store.images);
  const openMedia = useMediaViewerStore((store) => store.openMediaFromUrl);
  const items = useMemo(
    () => (data ? collectThreadImages(data.visibleResponses, data.messageProtocol) : []),
    [data],
  );
  const rawUrls = useMemo(() => items.map((item) => item.rawUrl), [items]);

  if (!data) return <p className="side-panel__empty">スレッドの情報を取得できません。</p>;
  if (data.loading) return <p className="side-panel__empty">スレッドを読み込み中…</p>;
  if (data.error && data.responses.length === 0)
    return <p className="side-panel__empty">{data.error}</p>;
  if (items.length === 0) return <p className="side-panel__empty">画像はありません。</p>;

  const style: TileStyle = { "--res-thumb-blur-radius": `${data.imageBlurRadius}px` };
  return (
    <div className="side-panel__content">
      <p>{items.length} 件</p>
      <ul className="side-panel__images" style={style}>
        {items.map((item) => {
          const status = imageStates.get(item.rawUrl)?.status;
          // 取得前の画像は ExternalImage 自身が取得ボタンを出すため、ビューアーのボタンで包まない。
          const isLoadStarted = status === "requested" || status === "loaded";
          const isBlurred = data.blurredResNums.has(item.resNum);
          const image = (
            <ExternalImage
              src={item.src}
              data-image-key={item.rawUrl}
              alt={`>>${item.resNum} の画像`}
              className="side-panel__image-thumb"
              loading="lazy"
              // 本文と同じ手動取得設定に従い、サイドパネルを開いただけで画像を取得しない。
              manualLoad={manualImageLoading}
            />
          );
          return (
            <li
              key={item.rawUrl}
              className={`side-panel__image${isBlurred ? " side-panel__image--blurred" : ""}`}
              title={`>>${item.resNum} ${item.text}`}
            >
              {isLoadStarted ? (
                <button
                  type="button"
                  className="side-panel__image-open"
                  aria-label={`>>${item.resNum} の画像を拡大`}
                  onClick={() =>
                    openMedia(
                      item.rawUrl,
                      rawUrls,
                      getThreadMediaViewerScopeId(tabId, page.threadUrl),
                    )
                  }
                >
                  {image}
                </button>
              ) : (
                image
              )}
              <button
                type="button"
                className="side-panel__image-caption"
                onClick={() => requestThreadResJump(page.threadUrl, item.resNum, tabId, true)}
              >
                <strong>{item.resNum}</strong>
                <span>{item.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
