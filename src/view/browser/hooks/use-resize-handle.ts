import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

interface ResizeHandleOptions {
  /** 保存済みの大きさ。 */
  value: number;
  min: number;
  max: number;
  /** ドラッグする向き。x は左右、y は上下。 */
  axis: "x" | "y";
  /**
   * ポインタの移動量に対する大きさの変わり方。右・下へ引くほど大きくなるなら 1、
   * 右端に置いたサイドパネルや下部パネルのように左・上へ引くほど大きくなるなら -1。
   */
  direction: 1 | -1;
  /** 矢印キー1回で変える量。 */
  keyboardStep: number;
  /** 確定した大きさ。ドラッグ中は呼ばず、離したときとキー操作のときだけ呼ぶ。 */
  onCommit: (value: number) => void;
}

const KEY_DELTAS: Record<ResizeHandleOptions["axis"], Record<string, number>> = {
  x: { ArrowLeft: -1, ArrowRight: 1 },
  y: { ArrowUp: -1, ArrowDown: 1 },
};

/**
 * パネルの大きさを変える区切り線の操作をまとめる。ポインタはキャプチャして
 * ハンドルの外へ出ても追従し、キャンセルされたら元の大きさに戻す。
 * ドラッグ中は表示用の大きさだけを変え、保存は離したときの1回にする。
 */
export function useResizeHandle({
  value,
  min,
  max,
  axis,
  direction,
  keyboardStep,
  onCommit,
}: ResizeHandleOptions) {
  const [preview, setPreview] = useState<number | null>(null);
  const dragRef = useRef<{ start: number; value: number } | null>(null);
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  const position = (event: PointerEvent) => (axis === "x" ? event.clientX : event.clientY);
  const sizeAt = (event: PointerEvent) => {
    const drag = dragRef.current;
    return drag ? clamp(drag.value + direction * (position(event) - drag.start)) : value;
  };
  const endDrag = (event: PointerEvent) => {
    dragRef.current = null;
    setPreview(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleProps = {
    role: "separator",
    // 区切り線の向き。左右に動かす線は縦線になる。
    "aria-orientation": axis === "x" ? "vertical" : "horizontal",
    "aria-valuenow": value,
    "aria-valuemin": min,
    "aria-valuemax": max,
    tabIndex: 0,
    onPointerDown: (event: PointerEvent) => {
      // テキストの選択が始まらないようにし、ハンドルの外へ出てもポインタを追う。
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = { start: position(event), value };
      setPreview(value);
    },
    onPointerMove: (event: PointerEvent) => {
      if (dragRef.current) setPreview(sizeAt(event));
    },
    onPointerUp: (event: PointerEvent) => {
      if (!dragRef.current) return;
      const next = sizeAt(event);
      endDrag(event);
      onCommit(next);
    },
    onPointerCancel: (event: PointerEvent) => {
      if (dragRef.current) endDrag(event);
    },
    onKeyDown: (event: KeyboardEvent) => {
      const delta = KEY_DELTAS[axis][event.key];
      if (delta === undefined) return;
      event.preventDefault();
      onCommit(clamp(value + direction * delta * keyboardStep));
    },
  } as const;

  return { size: preview ?? value, handleProps };
}
