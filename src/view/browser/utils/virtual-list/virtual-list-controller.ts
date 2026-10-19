import {
  captureItemAnchor,
  isAtEnd,
  type ListViewport,
  resolveAnchorTop,
  type ScrollAnchor,
  type TopBounds,
} from "src/view/browser/utils/virtual-list/anchor";
import {
  buildLayout,
  collectRenderIndexes,
  getItemSize,
  getItemTop,
  getTotalSize,
  getVisibleRange,
  type VirtualKey,
  type VirtualLayout,
} from "src/view/browser/utils/virtual-list/layout";
import {
  createSizeCache,
  type SizeCache,
  type SizeEntry,
} from "src/view/browser/utils/virtual-list/size-cache";

/**
 * 仮想リストの状態をまとめ、DOMとReactに依存しない形で「何をどこに描き、どこへスクロールするか」を決める。
 *
 * 入力はスクロール容器の状態（updateViewport）、項目の並び（setItems）、実測結果（reportSizes）だけで、
 * 出力は描画する項目と位置（getSnapshot）と、容器に設定すべき scrollTop（takeScrollRequest）。
 * 高さが変わるたびにアンカー（見ている項目とその中の位置）から scrollTop を逆算するため、
 * 推定値と実測値の差がどれだけあっても、見ている内容は動かない。
 */

export interface ContainerViewport {
  /** スクロール容器の scrollTop。 */
  scrollTop: number;
  /** スクロール容器の表示領域の高さ。 */
  height: number;
  /** スクロール内容の先頭からリストの上端までの距離（上に固定ヘッダなどがある分）。 */
  listTop: number;
  /** リストの下端からスクロール内容の末尾までの距離（下の余白や追従の境界線の分）。 */
  trailing: number;
}

export interface VirtualListItem {
  key: VirtualKey;
  index: number;
  /** リストの上端からの位置。 */
  top: number;
  size: number;
}

export interface VirtualListSnapshot {
  readonly items: readonly VirtualListItem[];
  readonly totalSize: number;
  readonly version: number;
}

export interface ScrollToKeyOptions {
  align?: "start" | "center";
  /** start のとき、項目の上端を表示領域の上端からこの距離だけ下に置く。 */
  offset?: number;
}

export interface VirtualListStats {
  corrections: number;
  lastCorrectionDelta: number;
  measuredCount: number;
  estimatedCount: number;
}

export interface VirtualListControllerOptions {
  /** 実測値がないときの高さ。stale はシグネチャの違う古い実測値（あれば）。 */
  estimateSize: (key: VirtualKey, index: number, stale: SizeEntry | undefined) => number;
  /** 表示領域の上下に余分に描画する距離。 */
  overscanPx?: number;
  /** 最下部とみなす距離。 */
  endThreshold?: number;
  /** キーの並び順。絞り込みでアンカーの項目が消えたとき、次の項目を選ぶのに使う。 */
  orderOf?: (key: VirtualKey) => number;
  /** 実測値の保存先。画面を作り直しても高さを覚えておくため、外から渡せるようにする。 */
  sizeCache?: SizeCache;
}

const DEFAULT_OVERSCAN_PX = 600;
const DEFAULT_END_THRESHOLD = 1;
/** scrollTop の差がこれ以下なら補正しない（小数の丸めで書き込みが続くのを防ぐ）。 */
const SCROLL_EPSILON = 0.5;

export class VirtualListController {
  private readonly options: Required<Omit<VirtualListControllerOptions, "orderOf">> &
    Pick<VirtualListControllerOptions, "orderOf">;
  private readonly cache: SizeCache;
  private keys: readonly VirtualKey[] = [];
  private signatureOf: (key: VirtualKey) => string = () => "";
  private layout: VirtualLayout = buildLayout([], () => 0);
  private viewport: ContainerViewport | null = null;
  private anchor: ScrollAnchor | null = null;
  private stickToEnd = false;
  /** 中央揃えでジャンプした項目。実測で高さが変わるたびに中央を求め直すため、操作されるまで覚える。 */
  private centeredKey: VirtualKey | null = null;
  private pinnedKeys: ReadonlySet<VirtualKey> = new Set();
  /** 自分で書き込んだ scrollTop。scroll イベントがこの値なら、利用者の操作ではない。 */
  private lastWrittenScrollTop: number | null = null;
  private pendingScrollTop: number | null = null;
  private snapshot: VirtualListSnapshot = { items: [], totalSize: 0, version: 0 };
  private readonly listeners = new Set<() => void>();
  private readonly stats: VirtualListStats = {
    corrections: 0,
    lastCorrectionDelta: 0,
    measuredCount: 0,
    estimatedCount: 0,
  };

  constructor(options: VirtualListControllerOptions) {
    this.options = {
      overscanPx: DEFAULT_OVERSCAN_PX,
      endThreshold: DEFAULT_END_THRESHOLD,
      sizeCache: options.sizeCache ?? createSizeCache(),
      ...options,
    };
    this.cache = this.options.sizeCache;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): VirtualListSnapshot => this.snapshot;

  getAnchor(): ScrollAnchor | null {
    return this.anchor;
  }

  getStats(): Readonly<VirtualListStats> {
    return this.stats;
  }

  /** 項目の並びと、各項目の描画条件を設定する。シグネチャが変わった項目は推定値に戻る。 */
  setItems(keys: readonly VirtualKey[], signatureOf: (key: VirtualKey) => string): void {
    if (this.anchor?.kind === "end" && !this.stickToEnd) {
      // 追従しないときは、最下部にいても新着で表示が動かないよう、今見ている項目へ付け替える。
      const viewport = this.toListViewport();
      if (viewport) this.anchor = captureItemAnchor(this.layout, viewport);
    }
    this.keys = keys;
    this.signatureOf = signatureOf;
    this.relayout();
  }

  /**
   * スクロール容器の状態を受け取る。
   * scrollTop が自分の書き込み以外で変わっていれば、利用者（またはブラウザ）がスクロールしたので
   * アンカーを取り直す。変わっていなければ、固定ヘッダの伸び縮みや表示領域の高さの変化で
   * リストが動いた分をアンカーで打ち消す。
   *
   * preserveAnchor は、非表示から戻ったときのように scrollTop が利用者の操作と無関係に
   * 失われている場合に使う。今の scrollTop は捨て、覚えているアンカーの位置へ戻す。
   */
  updateViewport(viewport: ContainerViewport, options: { preserveAnchor?: boolean } = {}): void {
    const previous = this.viewport;
    this.viewport = viewport;
    const isOwnWrite =
      this.lastWrittenScrollTop !== null &&
      Math.abs(viewport.scrollTop - this.lastWrittenScrollTop) <= SCROLL_EPSILON;
    const moved =
      previous === null || Math.abs(viewport.scrollTop - previous.scrollTop) > SCROLL_EPSILON;
    if (this.anchor === null || (moved && !isOwnWrite && !options.preserveAnchor)) {
      this.lastWrittenScrollTop = null;
      this.centeredKey = null;
      this.captureAnchor();
      this.publish();
      return;
    }
    this.reconcile();
    this.publish();
  }

  /**
   * 実測した高さを受け取る。
   * 高さ0は「何も描かない項目」（非表示のNGレスなど）として受け付けるので、
   * 容器ごと非表示（display:none）の間に測った値は、呼び出し側で渡さないこと。
   */
  reportSizes(entries: Iterable<{ key: VirtualKey; size: number }>): void {
    let changed = false;
    for (const { key, size } of entries) {
      if (!Number.isFinite(size) || size < 0 || !this.layout.indexByKey.has(key)) continue;
      if (this.cache.set(key, this.signatureOf(key), size)) changed = true;
    }
    if (changed) this.relayout();
  }

  /** 最下部にいるとき、新着が来ても最下部に留まるかどうか（自動更新の追従用）。 */
  setStickToEnd(stickToEnd: boolean): void {
    this.stickToEnd = stickToEnd;
  }

  /** 表示範囲の外でも描画し続ける項目（文字を選択中のレスなど）。 */
  setPinnedKeys(keys: Iterable<VirtualKey>): void {
    const next = new Set(keys);
    if (next.size === this.pinnedKeys.size && [...next].every((key) => this.pinnedKeys.has(key))) {
      return;
    }
    this.pinnedKeys = next;
    this.publish();
  }

  /**
   * 指定した項目へスクロールする。並びにない項目なら false。
   * アンカーをその項目に固定するので、移動後に周りの高さが実測で変わっても目的の項目から離れない。
   */
  scrollToKey(key: VirtualKey, options: ScrollToKeyOptions = {}): boolean {
    const index = this.layout.indexByKey.get(key);
    if (index === undefined || !this.viewport) return false;
    this.centeredKey = options.align === "center" ? key : null;
    this.anchor = { kind: "item", key, offset: -(options.offset ?? 0), index };
    this.reconcile();
    this.publish();
    return true;
  }

  /** 最下部へスクロールする。 */
  scrollToEnd(): void {
    if (!this.viewport) return;
    this.centeredKey = null;
    this.anchor = { kind: "end" };
    this.reconcile();
    this.publish();
  }

  /** 容器へ書き込むべき scrollTop を取り出す。DOMへ反映したら、その値は自分の書き込みとして扱う。 */
  takeScrollRequest(): number | null {
    const request = this.pendingScrollTop;
    this.pendingScrollTop = null;
    return request;
  }

  hasScrollRequest(): boolean {
    return this.pendingScrollTop !== null;
  }

  getItemTop(key: VirtualKey): number | null {
    return this.getItem(key)?.top ?? null;
  }

  /** 項目の位置と高さ。位置はリストの上端から。並びになければ null。 */
  getItem(key: VirtualKey): VirtualListItem | null {
    const index = this.layout.indexByKey.get(key);
    return index === undefined ? null : this.itemAt(index);
  }

  /** 並んでいる全項目を、描画しているかどうかに関わらず順に渡す（ミニマップの描画用）。 */
  forEachItem(callback: (item: VirtualListItem) => void): void {
    for (let index = 0; index < this.layout.keys.length; index++) callback(this.itemAt(index));
  }

  getTotalSize(): number {
    return getTotalSize(this.layout);
  }

  /** 最後に受け取った容器の状態。まだ表示されていなければ null。 */
  getViewport(): Readonly<ContainerViewport> | null {
    return this.viewport;
  }

  /** 余白を含めず、表示領域に実際にかかっている項目（既読位置の保存用）。 */
  getVisibleItems(): VirtualListItem[] {
    const viewport = this.toListViewport();
    if (!viewport) return [];
    const range = getVisibleRange(this.layout, viewport.top, viewport.height, 0);
    const items: VirtualListItem[] = [];
    for (let index = range.start; index < range.end; index++) items.push(this.itemAt(index));
    return items;
  }

  private relayout(): void {
    let measured = 0;
    this.layout = buildLayout(this.keys, (key, index) => {
      const size = this.cache.get(key, this.signatureOf(key));
      if (size !== undefined) {
        measured += 1;
        return size;
      }
      return this.options.estimateSize(key, index, this.cache.peek(key));
    });
    this.stats.measuredCount = measured;
    this.stats.estimatedCount = this.keys.length - measured;
    if (this.anchor === null) this.captureAnchor();
    else this.reconcile();
    this.publish();
  }

  private captureAnchor(): void {
    const viewport = this.toListViewport();
    if (!viewport) return;
    const bounds = this.getBounds();
    // 最下部にいる間は、実測で高さが変わっても最下部に留まる（「最下部へ」の操作が実測で外れないように）。
    // 新着で引っぱるかどうかは setItems で stickToEnd を見て決める。
    if (bounds && isAtEnd(viewport, bounds, this.options.endThreshold)) {
      this.anchor = { kind: "end" };
      return;
    }
    this.anchor = captureItemAnchor(this.layout, viewport);
  }

  /** アンカーから scrollTop を逆算し、今の位置とずれていれば書き込みを予約する。 */
  private reconcile(): void {
    const viewport = this.viewport;
    const bounds = this.getBounds();
    if (!viewport || !bounds || !this.anchor) return;
    this.recenterAnchor(viewport.height);
    const listTop = resolveAnchorTop(this.layout, this.anchor, bounds, this.options.orderOf);
    const scrollTop = listTop + viewport.listTop;
    const delta = scrollTop - viewport.scrollTop;
    // 丸めで書き込みが変わらない差（1px未満）は補正しない。小数の誤差で書き込みが続くのを防ぐ。
    if (Math.abs(delta) < 1) return;
    this.stats.corrections += 1;
    this.stats.lastCorrectionDelta = delta;
    // ブラウザは scrollTop を画素単位に丸めるため、こちらも整数で書き込み、自分の書き込みと判別できるようにする。
    const roundedScrollTop = Math.round(scrollTop);
    this.pendingScrollTop = roundedScrollTop;
    this.lastWrittenScrollTop = roundedScrollTop;
    // 書き込み後の位置を前提に描画範囲を決め、補正先の項目が描画されていない状態を作らない。
    this.viewport = { ...viewport, scrollTop: roundedScrollTop };
  }

  /** 中央揃えの項目は、今の高さで「項目の中心が表示領域の中心に来る」offset を求め直す。 */
  private recenterAnchor(viewportHeight: number): void {
    const anchor = this.anchor;
    if (anchor?.kind !== "item" || anchor.key !== this.centeredKey) return;
    const index = this.layout.indexByKey.get(anchor.key);
    if (index === undefined) return;
    this.anchor = {
      ...anchor,
      offset: (getItemSize(this.layout, index) - viewportHeight) / 2,
      index,
    };
  }

  private getBounds(): TopBounds | null {
    const viewport = this.viewport;
    if (!viewport) return null;
    return {
      min: -viewport.listTop,
      max: Math.max(
        -viewport.listTop,
        getTotalSize(this.layout) + viewport.trailing - viewport.height,
      ),
    };
  }

  private toListViewport(): ListViewport | null {
    const viewport = this.viewport;
    if (!viewport) return null;
    return { top: viewport.scrollTop - viewport.listTop, height: viewport.height };
  }

  private itemAt(index: number): VirtualListItem {
    return {
      key: this.layout.keys[index]!,
      index,
      top: getItemTop(this.layout, index),
      size: getItemSize(this.layout, index),
    };
  }

  private publish(): void {
    const viewport = this.toListViewport();
    const range = viewport
      ? getVisibleRange(this.layout, viewport.top, viewport.height, this.options.overscanPx)
      : { start: 0, end: 0 };
    const items = collectRenderIndexes(this.layout, range, this.pinnedKeys).map((index) =>
      this.itemAt(index),
    );
    const totalSize = getTotalSize(this.layout);
    // 描画内容が同じでも、スクロールの書き込みが予約されていれば知らせて反映させる。
    if (isSameSnapshot(this.snapshot, items, totalSize) && this.pendingScrollTop === null) return;
    this.snapshot = { items, totalSize, version: this.snapshot.version + 1 };
    for (const listener of this.listeners) listener();
  }
}

function isSameSnapshot(
  snapshot: VirtualListSnapshot,
  items: readonly VirtualListItem[],
  totalSize: number,
): boolean {
  if (snapshot.totalSize !== totalSize || snapshot.items.length !== items.length) return false;
  return snapshot.items.every((item, index) => {
    const next = items[index]!;
    return item.key === next.key && item.top === next.top && item.size === next.size;
  });
}
