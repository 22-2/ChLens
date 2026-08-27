/**
 * DOMイベントのtargetをElementへ正規化する。
 * UIコンポーネントごとにNode/TextNodeの判定を重複させず、ブラウザイベント境界だけを
 * ここへ集めることで、他のユーティリティをDOM構造から独立させる。
 */

export function getEventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}
