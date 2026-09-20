/**
 * DOMイベントのtargetをElementへ正規化する。
 * UIコンポーネントごとにNode/TextNodeの判定を重複させず、ブラウザイベント境界だけを
 * ここへ集めることで、他のユーティリティをDOM構造から独立させる。
 */

export function getEventTargetElement(
  target: EventTarget | null,
  targetWindow: Window = globalThis.window,
): Element | null {
  const targetWindowWithConstructors = targetWindow as Window & typeof globalThis;
  if (target instanceof targetWindowWithConstructors.Element) {
    return target as Element;
  }
  if (target instanceof targetWindowWithConstructors.Node) {
    return (target as Node).parentElement;
  }
  return null;
}

/** 別窓のレイアウト要素を、その窓のHTMLElementコンストラクタで判定する。 */
export function isHTMLElementInWindow(value: unknown, targetWindow: Window): value is HTMLElement {
  const targetWindowWithConstructors = targetWindow as Window & typeof globalThis;
  return value instanceof targetWindowWithConstructors.HTMLElement;
}

/** 別窓に紐づくResizeObserverを取得し、未実装環境ではnullを返す。 */
export function getResizeObserverForWindow(
  targetWindow: Window,
): typeof ResizeObserver | undefined {
  const targetWindowWithConstructors = targetWindow as Window & typeof globalThis;
  return targetWindowWithConstructors.ResizeObserver;
}
