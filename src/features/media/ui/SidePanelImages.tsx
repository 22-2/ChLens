import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useMediaImageStore } from "src/features/media/browser/use-media-image-store";
import {
  getThreadMediaViewerScopeId,
  useMediaViewerStore,
} from "src/features/media/browser/use-media-viewer-store";
import { collectThreadImages } from "src/features/media/domain/thread-images";
import { ExternalImage } from "src/features/media/ui/ExternalImage";
import { SidePanelMessage } from "src/view/browser/components/SidePanelMessage";
import { ThreadSnapshotGate } from "src/view/browser/components/ThreadSnapshotGate";
import type { ThreadSnapshot } from "src/view/browser/state/thread-snapshot";
import type { ThreadPage } from "src/view/browser/types";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";

type TileStyle = CSSProperties & { "--res-thumb-blur-radius"?: string };

function ThreadImageGrid({
  tabId,
  threadUrl,
  data,
}: {
  tabId: string;
  threadUrl: string;
  data: ThreadSnapshot;
}) {
  const imageStates = useMediaImageStore((store) => store.images);
  const openMedia = useMediaViewerStore((store) => store.openMediaFromUrl);
  const items = useMemo(
    () => collectThreadImages(data.visibleResponses, data.messageProtocol),
    [data],
  );
  const rawUrls = useMemo(() => items.map((item) => item.rawUrl), [items]);

  if (items.length === 0) return <SidePanelMessage>画像はありません。</SidePanelMessage>;

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
              // ギャラリーは取得操作を明示したときだけ読み込み、取得済み画像だけを表示する。
              manualLoad
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
                    openMedia(item.rawUrl, rawUrls, getThreadMediaViewerScopeId(tabId, threadUrl))
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
                onClick={() => requestThreadResJump(threadUrl, item.resNum, tabId, true)}
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

export function SidePanelImages({ tabId, page }: { tabId: string; page: ThreadPage }) {
  return (
    <ThreadSnapshotGate tabId={tabId} threadUrl={page.threadUrl}>
      {(snapshot) => <ThreadImageGrid tabId={tabId} threadUrl={page.threadUrl} data={snapshot} />}
    </ThreadSnapshotGate>
  );
}
