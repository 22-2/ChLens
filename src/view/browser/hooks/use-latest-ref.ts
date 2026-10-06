import { type RefObject, useLayoutEffect, useRef } from "react";

/**
 * 最新の値を指す ref を返す。effect やタイマーの callback から、依存配列へ入れずに
 * 最新の props を読むために使う。
 *
 * passive effect で同期すると、同じ commit の layout effect から古い値が見えてしまう。
 * 自動更新の完了判定は layout effect で行うため、layout effect で先に差し替える。
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
