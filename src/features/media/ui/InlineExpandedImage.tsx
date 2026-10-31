import { ExternalLink, Minimize2 } from "lucide-react";
import React, { useRef, useState } from "react";
import { createLogger } from "src/app/logger";

import { ExternalImage } from "./ExternalImage";
import type { ThumbStyle } from "./res-media-items";

const logger = createLogger("media");

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
  const dragRef = useRef<{
    x: number;
    width: number;
    min: number;
    max: number;
    current: number;
  } | null>(null);
  const displayedWidth = previewWidth ?? width;

  const getBounds = () => {
    const wrapper = wrapperRef.current;
    const image = wrapper?.querySelector("img");
    const parent = wrapper?.parentElement;
    if (!wrapper || !image || !parent) return null;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const paddingRight = parseFloat(getComputedStyle(parent).paddingRight) || 0;
    const max = Math.max(
      1,
      parent.getBoundingClientRect().right - wrapper.getBoundingClientRect().left - paddingRight,
    );
    return {
      width: rect.width,
      ratio: rect.width / rect.height,
      min: Math.min(96, rect.width, max),
      max,
    };
  };
  const clampWidth = (value: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(max, value)));
  // 右辺のハンドルは横方向だけで幅を変え、画像の縦横比はCSSで維持する。
  // ドラッグ中は局所的に描画し、確定時だけ親へ渡して仮想化後も幅を保つ。
  const updateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.x;
    drag.current = clampWidth(drag.width + delta, drag.min, drag.max);
    setPreviewWidth(drag.current);
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
            const bounds = getBounds();
            if (!bounds) return;
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = {
              ...bounds,
              x: event.clientX,
              current: bounds.width,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => updateDrag(event)}
          onPointerUp={(event) => {
            if (!dragRef.current) return;
            updateDrag(event);
            const next = dragRef.current.current;
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
            const direction =
              event.key === "ArrowRight" || event.key === "ArrowUp"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowDown"
                  ? -1
                  : 0;
            if (!direction) return;
            const bounds = getBounds();
            if (!bounds) return;
            event.preventDefault();
            event.stopPropagation();
            onResize(clampWidth(bounds.width + direction * 20, bounds.min, bounds.max));
          }}
        />
      )}
    </div>
  );
}
