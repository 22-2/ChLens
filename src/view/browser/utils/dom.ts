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
  const ElementConstructor = targetWindowWithConstructors.Element;
  const NodeConstructor = targetWindowWithConstructors.Node;
  // 別窓のWindowProxyではconstructorプロパティが未公開のことがあるため、
  // constructorが使えない時もNodeの形状でイベント元を復元して操作を止めない。
  if (typeof ElementConstructor === "function" && target instanceof ElementConstructor) {
    return target as Element;
  }
  if (typeof NodeConstructor === "function" && target instanceof NodeConstructor) {
    return (target as Node).parentElement;
  }

  if (target && typeof target === "object" && "nodeType" in target) {
    const node = target as Node;
    if (node.nodeType === 1) {
      return node as Element;
    }
    if (node.nodeType === 3) {
      return node.parentElement;
    }
  }
  return null;
}

/** 別窓のレイアウト要素を、その窓のHTMLElementコンストラクタで判定する。 */
export function isHTMLElementInWindow(value: unknown, targetWindow: Window): value is HTMLElement {
  const targetWindowWithConstructors = targetWindow as Window & typeof globalThis;
  const HTMLElementConstructor = targetWindowWithConstructors.HTMLElement;
  if (typeof HTMLElementConstructor === "function") {
    return value instanceof HTMLElementConstructor;
  }

  // WindowProxyがHTMLElementを公開しない場合も、対象Documentに属する要素なら
  // レイアウト計算やスクロールの対象として扱えるため、所属Documentで判定する。
  return (
    value != null &&
    typeof value === "object" &&
    (value as Node).nodeType === 1 &&
    (value as Node).ownerDocument === targetWindow.document
  );
}

/** 別窓に紐づくResizeObserverを取得し、未実装環境ではnullを返す。 */
export function getResizeObserverForWindow(
  targetWindow: Window,
): typeof ResizeObserver | undefined {
  const targetWindowWithConstructors = targetWindow as Window & typeof globalThis;
  return targetWindowWithConstructors.ResizeObserver;
}
