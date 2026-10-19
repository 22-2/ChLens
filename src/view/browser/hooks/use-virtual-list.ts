import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import type { VirtualKey } from "src/view/browser/utils/virtual-list/layout";
import type {
  ContainerViewport,
  VirtualListController,
  VirtualListSnapshot,
} from "src/view/browser/utils/virtual-list/virtual-list-controller";

interface UseVirtualListParams {
  controller: VirtualListController;
  /** スクロールする容器（タブのパネル）。 */
  scrollContainerRef: RefObject<HTMLElement | null>;
  /** 全体の高さを持つリストの箱。上の固定ヘッダや下の余白との位置関係を測る。 */
  listRef: RefObject<HTMLElement | null>;
  /** 非表示の間はスクロールや実測を controller へ渡さない（display:none の値は0になるため）。 */
  enabled: boolean;
}

interface UseVirtualListResult {
  snapshot: VirtualListSnapshot;
  /** 各項目の要素へ付ける ref。付けた要素の高さを実測して controller へ渡す。 */
  measureItem: (key: VirtualKey) => (element: HTMLElement | null) => void;
}

const KEY_ATTRIBUTE = "data-virtual-key";

/**
 * VirtualListController をスクロール容器とReactの描画へつなぐ。
 *
 * DOMから読むのは「スクロール容器の状態」と「描画した項目の高さ」だけで、位置の判断は
 * すべて controller に任せる。controller が求めた scrollTop は、合計の高さが描画に
 * 反映された直後（useLayoutEffect）に書き込むので、ブラウザに切り詰められず、画面にも
 * 補正前の状態が描かれない。
 */
export function useVirtualList({
  controller,
  scrollContainerRef,
  listRef,
  enabled,
}: UseVirtualListParams): UseVirtualListResult {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const keyByElementRef = useRef(new WeakMap<Element, VirtualKey>());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // 同じ描画で走る layout effect から最新の値を読めるよう、宣言順を他の effect より前にする。
  const enabledRef = useLatestRef(enabled);

  const readViewport = useCallback((): ContainerViewport | null => {
    const container = scrollContainerRef.current;
    const list = listRef.current;
    // 非表示の容器は高さ0になり、そのまま渡すと表示範囲が空になってアンカーも失われる。
    if (!container || !list || container.clientHeight === 0) return null;
    const containerRect = container.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const listTop = listRect.top - containerRect.top + container.scrollTop;
    return {
      scrollTop: container.scrollTop,
      height: container.clientHeight,
      listTop,
      trailing: Math.max(0, container.scrollHeight - listTop - listRect.height),
    };
  }, [listRef, scrollContainerRef]);

  const syncViewport = useCallback(() => {
    if (!enabledRef.current) return;
    const viewport = readViewport();
    if (viewport) controller.updateViewport(viewport);
  }, [controller, enabledRef, readViewport]);

  const applyScrollRequest = useCallback(() => {
    const container = scrollContainerRef.current;
    const request = controller.takeScrollRequest();
    if (!container || request === null) return;
    container.scrollTop = request;
    // scroll イベントを待たずに書き込み後の位置を渡し、切り詰められた場合も controller の認識を揃える。
    syncViewport();
  }, [controller, scrollContainerRef, syncViewport]);

  useLayoutEffect(() => {
    if (enabled) applyScrollRequest();
  }, [applyScrollRequest, enabled, snapshot]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    // 表示された時点の状態を描画前に渡し、覚えているアンカーの位置へすぐ合わせる。
    // 非表示の間にリストを外したため、ここで読む scrollTop は利用者の操作の結果ではない。
    const viewport = readViewport();
    if (viewport) controller.updateViewport(viewport, { preserveAnchor: true });
    applyScrollRequest();

    const handleScroll = () => syncViewport();
    container.addEventListener("scroll", handleScroll, { passive: true });
    // 表示領域の高さの変化（ウィンドウのリサイズ）と、リストの上下にある要素の伸び縮みを拾う。
    const layoutObserver = new ResizeObserver(() => {
      syncViewport();
      applyScrollRequest();
    });
    layoutObserver.observe(container);
    // 容器の直下の要素はリストの上の固定ヘッダも含むため、その伸び縮みでリストが動いたことを拾える。
    const content = container.firstElementChild;
    if (content) layoutObserver.observe(content);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      layoutObserver.disconnect();
    };
  }, [applyScrollRequest, controller, enabled, readViewport, scrollContainerRef, syncViewport]);

  const handleItemResizeRef = useLatestRef((entries: ResizeObserverEntry[]) => {
    const container = scrollContainerRef.current;
    if (!enabledRef.current || !container || container.clientHeight === 0) return;
    const sizes: Array<{ key: VirtualKey; size: number }> = [];
    for (const entry of entries) {
      const key = keyByElementRef.current.get(entry.target);
      if (key === undefined) continue;
      const borderBox = entry.borderBoxSize?.[0];
      sizes.push({
        key,
        size: borderBox ? borderBox.blockSize : entry.target.getBoundingClientRect().height,
      });
    }
    controller.reportSizes(sizes);
    applyScrollRequest();
  });

  // 項目の ref は描画の確定時（effect より前）に呼ばれるため、監視役はそこで必要になった時点で作る。
  const getResizeObserver = useCallback(() => {
    resizeObserverRef.current ??= new ResizeObserver((entries) =>
      handleItemResizeRef.current(entries),
    );
    return resizeObserverRef.current;
  }, [handleItemResizeRef]);

  useEffect(
    () => () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    },
    [],
  );

  const refCallbacksRef = useRef(new Map<VirtualKey, (element: HTMLElement | null) => void>());
  const measureItem = useCallback(
    (key: VirtualKey) => {
      // 項目ごとに同じ関数を返し、再描画のたびに ref の付け外し（監視のやり直し）が起きないようにする。
      const cached = refCallbacksRef.current.get(key);
      if (cached) return cached;
      let current: HTMLElement | null = null;
      const callback = (element: HTMLElement | null) => {
        const observer = getResizeObserver();
        if (current && current !== element) {
          observer.unobserve(current);
          keyByElementRef.current.delete(current);
        }
        current = element;
        if (!element) {
          refCallbacksRef.current.delete(key);
          return;
        }
        element.setAttribute(KEY_ATTRIBUTE, String(key));
        keyByElementRef.current.set(element, key);
        observer.observe(element);
      };
      refCallbacksRef.current.set(key, callback);
      return callback;
    },
    [getResizeObserver],
  );

  return { snapshot, measureItem };
}
