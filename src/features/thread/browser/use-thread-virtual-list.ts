import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { registerDebugStateProvider } from "src/app/debug/debug-api";
import {
  DEFAULT_RES_HEIGHT_METRICS,
  estimateResHeight,
  type ResHeightMetrics,
} from "src/features/thread/domain/res-height-estimate";
import type { IReadState, IRes } from "src/service-container/interfaces";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { VirtualKey } from "src/view/browser/utils/virtual-list/layout";
import {
  VirtualListController,
  type VirtualListItem,
} from "src/view/browser/utils/virtual-list/virtual-list-controller";

/** 過去実況の再生位置を示す線。レスと同じ並びに入れ、位置計算を共通にする。 */
export const REPLAY_LINE_KEY = "archive-replay-line";

/** ミニマップなど、描画していないレスの位置も必要な部品へ渡す読み取り口。 */
export interface ThreadResponseLayout {
  /** スクロール内容の先頭からリストの上端まで。まだ表示されていなければ null。 */
  getListTop: () => number | null;
  getResponseBox: (resNum: number) => { top: number; size: number } | null;
  forEachResponse: (callback: (resNum: number, top: number, size: number) => void) => void;
  /** 位置が変わったときに呼ばれる。ThreadPage 全体を描画し直さないよう、使う部品が自分で購読する。 */
  subscribe: (listener: () => void) => () => void;
}

export interface ThreadScrollToResponseOptions {
  highlight?: boolean;
  offset?: number;
  align?: "start" | "center";
}

interface UseThreadVirtualListParams {
  responses: readonly IRes[];
  /** 再生位置の線を入れる場所（responses の何番目の前か）。-1 なら入れない。 */
  replayBoundary: number;
  scrollContainerRef: RefObject<HTMLElement | null>;
  /** 自動更新で最下部へ追従している間は true。 */
  stickToEnd: boolean;
  /** デバッグAPIで状態を公開するときの名前（`virtual-list:<tabId>`）。 */
  debugKey: string;
}

export interface UseThreadVirtualListResult {
  controller: VirtualListController;
  keys: readonly VirtualKey[];
  layout: ThreadResponseLayout;
  highlightKey: VirtualKey | null;
  onHighlightApplied: (key: VirtualKey) => void;
  scrollToResponse: (resNum: number, options?: ThreadScrollToResponseOptions) => boolean;
  measureReadState: (
    received: number,
  ) => Pick<IReadState, "last" | "read" | "received" | "offset"> | null;
  /** 並びに含まれるレスかどうか（絞り込みで消えたレスへのジャンプ待ちに使う）。 */
  hasResponse: (resNum: number) => boolean;
}

/** 本文の左右の余白。.res と .res__body の padding の合計に合わせたおおよその値。 */
const BODY_HORIZONTAL_PADDING = 96;
/** 幅をこの単位で丸めて実測値を区別する。1pxごとに作り直すと、リサイズ中ずっと推定値に戻るため。 */
const WIDTH_BUCKET_PX = 16;

/**
 * スレッドのレス一覧を仮想リストとして扱うための状態をまとめる。
 *
 * ThreadPage が持つレスの並びを VirtualListController へ渡し、レス番号でのジャンプ・
 * 既読位置の計測・ミニマップ用の位置を、DOMにレスがあるかどうかに関わらず提供する。
 * controller は画面を閉じるまで同じものを使うため、タブを非表示にしてレス一覧を外しても、
 * 実測した高さと見ていた位置はそのまま残る。
 */
export function useThreadVirtualList({
  responses,
  replayBoundary,
  scrollContainerRef,
  stickToEnd,
  debugKey,
}: UseThreadVirtualListParams): UseThreadVirtualListResult {
  const { window: viewWindow } = useViewSurface();
  const [containerWidth, setContainerWidth] = useState(0);
  const metrics = useMemo<ResHeightMetrics>(
    () => ({
      ...DEFAULT_RES_HEIGHT_METRICS,
      contentWidth:
        containerWidth > 0
          ? Math.max(120, containerWidth - BODY_HORIZONTAL_PADDING)
          : DEFAULT_RES_HEIGHT_METRICS.contentWidth,
    }),
    [containerWidth],
  );
  const resByNum = useMemo(() => new Map(responses.map((res) => [res.num, res])), [responses]);
  // 再生位置の線はレスの間に入るため、直後のレスより少しだけ前の順位にする。
  const replayOrder =
    replayBoundary < 0
      ? Number.NaN
      : (responses[replayBoundary]?.num ?? (responses.at(-1)?.num ?? 0) + 1) - 0.5;
  const estimateInputRef = useLatestRef({ resByNum, metrics, replayOrder });

  const [controller] = useState(
    () =>
      new VirtualListController({
        estimateSize: (key) => {
          if (typeof key !== "number") return 0;
          const { resByNum: currentResByNum, metrics: currentMetrics } = estimateInputRef.current;
          const res = currentResByNum.get(key);
          return res ? estimateResHeight(res, currentMetrics) : currentMetrics.chromeHeight;
        },
        orderOf: (key) => (typeof key === "number" ? key : estimateInputRef.current.replayOrder),
      }),
  );

  const keys = useMemo<VirtualKey[]>(() => {
    const nums: VirtualKey[] = responses.map((res) => res.num);
    if (replayBoundary >= 0 && replayBoundary <= nums.length) {
      nums.splice(replayBoundary, 0, REPLAY_LINE_KEY);
    }
    return nums;
  }, [replayBoundary, responses]);

  const widthSignature = `w${Math.round(containerWidth / WIDTH_BUCKET_PX)}`;
  useLayoutEffect(() => {
    controller.setItems(keys, () => widthSignature);
  }, [controller, keys, widthSignature]);

  useLayoutEffect(() => {
    controller.setStickToEnd(stickToEnd);
  }, [controller, stickToEnd]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const update = () => {
      // 非表示（display:none）の間は幅0になるため、最後に見えていた幅を使い続ける。
      if (container.clientWidth > 0) setContainerWidth(container.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  useEffect(() => {
    const viewDocument = viewWindow.document;
    // 文字を選択しているレスが範囲外へ外れると選択が消えるため、選択の起点と終点のレスを描画し続ける。
    const handleSelectionChange = () => {
      const selection = viewDocument.getSelection();
      if (!selection || selection.isCollapsed) {
        controller.setPinnedKeys([]);
        return;
      }
      const pinned = [selection.anchorNode, selection.focusNode]
        .map((node) => findResponseNum(node))
        .filter((num): num is number => num !== null);
      controller.setPinnedKeys(pinned);
    };
    viewDocument.addEventListener("selectionchange", handleSelectionChange);
    return () => viewDocument.removeEventListener("selectionchange", handleSelectionChange);
  }, [controller, viewWindow]);

  const [highlightKey, setHighlightKey] = useState<VirtualKey | null>(null);
  const onHighlightApplied = useCallback((key: VirtualKey) => {
    setHighlightKey((current) => (current === key ? null : current));
  }, []);

  const scrollToResponse = useCallback(
    (resNum: number, options: ThreadScrollToResponseOptions = {}) => {
      // 描画中の並びにないレスは controller にもまだ渡っていないため、ここで失敗として返す。
      // 並びが変わると作り直されるので、呼び出し側は絞り込み解除の後にジャンプをやり直せる。
      if (!keys.includes(resNum)) return false;
      const moved = controller.scrollToKey(resNum, {
        align: options.align,
        offset: options.offset,
      });
      if (moved && (options.highlight ?? true)) setHighlightKey(resNum);
      return moved;
    },
    [controller, keys],
  );

  const measureReadState = useCallback(
    (received: number) => {
      const viewport = controller.getViewport();
      if (!viewport || received <= 0) return null;
      const visible = controller.getVisibleItems().filter(isResponseItem);
      const anchor = visible[0];
      const bottom = visible.at(-1);
      if (!anchor || !bottom) return null;
      const last = anchor.key as number;
      return {
        last,
        read: Math.max(last, bottom.key as number),
        received,
        // 変更理由: 先頭に見えているレスのずれ量も保存しないと、途中まで読んだ長文レスの位置が
        // 復元時に先頭揃えへ潰れて「同じ場所に戻れない」状態になる。
        offset: Math.round(viewport.listTop + anchor.top - viewport.scrollTop),
      };
    },
    [controller],
  );

  const hasResponse = useCallback((resNum: number) => keys.includes(resNum), [keys]);

  // 位置の補正が起きた回数や描画中のレス数を、e2e と CDP から確かめられるようにする。
  useEffect(
    () =>
      registerDebugStateProvider(debugKey, () => {
        const snapshot = controller.getSnapshot();
        return {
          ...controller.getStats(),
          anchor: controller.getAnchor(),
          totalSize: snapshot.totalSize,
          renderedKeys: snapshot.items.map((item) => item.key),
          itemCount: keys.length,
        };
      }),
    [controller, debugKey, keys.length],
  );

  const layout = useMemo<ThreadResponseLayout>(
    () => ({
      getListTop: () => controller.getViewport()?.listTop ?? null,
      getResponseBox: (resNum) => controller.getItem(resNum),
      forEachResponse: (callback) =>
        controller.forEachItem((item) => {
          if (isResponseItem(item)) callback(item.key as number, item.top, item.size);
        }),
      subscribe: controller.subscribe,
    }),
    [controller],
  );

  return {
    controller,
    keys,
    layout,
    highlightKey,
    onHighlightApplied,
    scrollToResponse,
    measureReadState,
    hasResponse,
  };
}

function isResponseItem(item: VirtualListItem): boolean {
  return typeof item.key === "number";
}

function findResponseNum(node: Node | null): number | null {
  // 別窓では Element のコンストラクタが主窓と異なるため、instanceof ではなく nodeType で判定する。
  const element =
    node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : (node?.parentElement ?? null);
  const resElement = element?.closest<HTMLElement>("[data-res-num]");
  const num = Number.parseInt(resElement?.dataset.resNum ?? "", 10);
  return Number.isFinite(num) ? num : null;
}
