import { ExternalLink, Minimize2 } from "lucide-react";
import React, { useRef, useState } from "react";
import { createLogger } from "src/app/logger";

import { ExternalImage } from "./ExternalImage";
import {
  computeKeyboardResizeWidth,
  computeResizeBounds,
  getResizeKeyDirection,
  moveResizeDrag,
  type ResizeBounds,
  type ResizeDrag,
  startResizeDrag,
} from "./inline-image-resize";
import type { ThumbStyle } from "./res-media-items";

const logger = createLogger("media");

/** 画像と親要素の位置をDOMから読み取り、リサイズの範囲を求める。読み取れない状態では null を返す。 */
function readResizeBounds(wrapper: HTMLDivElement | null): ResizeBounds | null {
  const image = wrapper?.querySelector("img");
  const parent = wrapper?.parentElement;
  if (!wrapper || !image || !parent) return null;

  const rect = image.getBoundingClientRect();
  const paddingRight = parseFloat(getComputedStyle(parent).paddingRight) || 0;
  return computeResizeBounds({
    imageWidth: rect.width,
    imageHeight: rect.height,
    wrapperLeft: wrapper.getBoundingClientRect().left,
    parentRight: parent.getBoundingClientRect().right,
    parentPaddingRight: paddingRight,
  });
}

/** 元画像の読み込み中と失敗を同じ展開位置に表示する。 */
export function InlineExpandedImage({
  src,
  imageKey,
  isBlurred,
  blurStyle,
  onClose,
  onOpenViewer,
  width,
  onResize,
  onContextMenu,
  onLoad,
  onError,
}: {
  src: string;
  imageKey: string;
  isBlurred: boolean;
  blurStyle: ThumbStyle;
  onClose: () => void;
  onOpenViewer: () => void;
  width?: number;
  onResize?: (width: number) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [previewWidth, setPreviewWidth] = useState<number>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ResizeDrag | null>(null);
  const displayedWidth = previewWidth ?? width;

  // 右辺のハンドルは横方向だけで幅を変え、画像の縦横比はCSSで維持する。
  // ドラッグ中は局所的に描画し、確定時だけ親へ渡して仮想化後も幅を保つ。
  const updateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = moveResizeDrag(drag, event.clientX);
    setPreviewWidth(dragRef.current.current);
  };
  return (
    <div
      ref={wrapperRef}
      className={`res__inline-image${status === "loading" ? " res__inline-image--loading" : ""}${displayedWidth != null ? " res__inline-image--resized" : ""}${isBlurred ? " res__thumb--blurred" : ""}`}
      style={{ ...(isBlurred ? blurStyle : undefined), width: displayedWidth }}
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        className="res__inline-image-content"
        aria-label="画像を折りたたむ"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <ExternalImage
          src={src}
          data-image-key={imageKey}
          alt={imageKey}
          manualLoad={false}
          insideControl
          onLoad={(event) => {
            setStatus("loaded");
            onLoad(event);
          }}
          onError={() => {
            setStatus("error");
            logger.error("展開した画像を表示できませんでした", { url: imageKey });
            onError();
          }}
        />
        {status === "loading" && <span role="status">画像を読み込み中…</span>}
        {status === "error" && <span role="status">画像を表示できません。クリックして閉じる</span>}
      </button>
      <div className="res__inline-image-actions">
        <button
          type="button"
          aria-label="ビューアで開く"
          title="ビューアで開く"
          onClick={(event) => {
            event.stopPropagation();
            onOpenViewer();
          }}
        >
          <ExternalLink size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="画像を縮小"
          title="画像を縮小"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <Minimize2 size={16} aria-hidden="true" />
        </button>
      </div>
      {status === "loaded" && onResize && (
        <button
          type="button"
          className="res__inline-image-resize"
          aria-label="画像のサイズを変更"
          title="ドラッグまたは矢印キーで画像のサイズを変更"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const bounds = readResizeBounds(wrapperRef.current);
            if (!bounds) return;
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = startResizeDrag(bounds, event.clientX);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => updateDrag(event)}
          onPointerUp={(event) => {
            const drag = dragRef.current;
            if (!drag) return;
            const next = moveResizeDrag(drag, event.clientX).current;
            dragRef.current = null;
            setPreviewWidth(undefined);
            onResize(next);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setPreviewWidth(undefined);
          }}
          onLostPointerCapture={() => {
            dragRef.current = null;
            setPreviewWidth(undefined);
          }}
          onKeyDown={(event) => {
            const direction = getResizeKeyDirection(event.key);
            if (!direction) return;
            const bounds = readResizeBounds(wrapperRef.current);
            if (!bounds) return;
            event.preventDefault();
            event.stopPropagation();
            onResize(computeKeyboardResizeWidth(bounds, direction));
          }}
        />
      )}
    </div>
  );
}
