import type { VirtualKey } from "src/view/browser/utils/virtual-list/layout";
import { VirtualListController } from "src/view/browser/utils/virtual-list/virtual-list-controller";
import { describe, expect, it } from "vite-plus/test";

const ESTIMATED_SIZE = 50;

/** 推定値とわざと食い違う、決まった並びの実際の高さ（20〜300px）。 */
function realSizeOf(key: VirtualKey): number {
  const num = Number(key);
  return 20 + ((num * 37) % 281);
}

/**
 * ブラウザのスクロール容器の代わり。scrollTop を内容の高さで切り詰め、
 * 描画された項目だけを実測して controller へ返す（ResizeObserver の代わり）。
 */
class FakeScrollContainer {
  scrollTop = 0;

  constructor(
    readonly controller: VirtualListController,
    readonly height = 600,
    public listTop = 80,
    readonly trailing = 40,
  ) {}

  get scrollHeight(): number {
    return this.listTop + this.controller.getTotalSize() + this.trailing;
  }

  /** 描画・実測・補正の書き込みを、変化がなくなるまで繰り返す（数フレーム分）。 */
  flush(): void {
    for (let frame = 0; frame < 20; frame++) {
      // 実際の画面と同じく、予約された書き込みを先に反映してから scroll イベント相当を渡す。
      const request = this.controller.takeScrollRequest();
      if (request !== null) this.write(request);
      this.controller.updateViewport(this.viewport());
      const before = this.controller.getSnapshot().version;
      this.controller.reportSizes(
        this.controller.getSnapshot().items.map(({ key }) => ({ key, size: realSizeOf(key) })),
      );
      const settled = this.controller.getSnapshot().version === before;
      if (request === null && settled && !this.controller.hasScrollRequest()) return;
    }
    throw new Error("20フレーム以内に位置が収束しませんでした");
  }

  userScrollTo(scrollTop: number): void {
    this.write(scrollTop);
    this.flush();
  }

  /** 項目が表示領域の上端から何px下に見えているか。 */
  screenTopOf(key: VirtualKey): number {
    return this.listTop + this.controller.getItemTop(key)! - this.scrollTop;
  }

  topVisibleKey(): VirtualKey {
    return this.controller.getVisibleItems()[0]!.key;
  }

  viewport() {
    return {
      scrollTop: this.scrollTop,
      height: this.height,
      listTop: this.listTop,
      trailing: this.trailing,
    };
  }

  private write(scrollTop: number): void {
    this.scrollTop = Math.min(Math.max(0, scrollTop), this.scrollHeight - this.height);
  }
}

function keysOf(count: number, start = 1): number[] {
  return Array.from({ length: count }, (_, index) => start + index);
}

function setup(count = 1000) {
  const controller = new VirtualListController({
    estimateSize: () => ESTIMATED_SIZE,
    overscanPx: 200,
    orderOf: (key) => Number(key),
  });
  const container = new FakeScrollContainer(controller);
  controller.setItems(keysOf(count), () => "w800");
  container.flush();
  return { controller, container };
}

describe("仮想リストのcontroller", () => {
  it("描画するのは表示領域と余白にかかる項目だけ", () => {
    const { controller } = setup();
    const keys = controller.getSnapshot().items.map((item) => item.key);
    expect(keys[0]).toBe(1);
    expect(keys.length).toBeGreaterThan(3);
    expect(keys.length).toBeLessThan(40);
  });

  it("未実測の範囲を上へ少しずつスクロールしても、見ている項目は操作した量だけ動く", () => {
    const { container } = setup();
    container.userScrollTo(30_000);
    for (let step = 0; step < 150; step++) {
      const key = container.topVisibleKey();
      const before = container.screenTopOf(key);
      container.userScrollTo(container.scrollTop - 37);
      // 上の項目が実測で何px変わっても、見ていた項目は37px下へ動くだけで飛ばない。
      expect(container.screenTopOf(key)).toBeCloseTo(before + 37, 5);
    }
  });

  it("遠くの未実測の項目へジャンプすると、周りが実測されたあとも表示領域の上端に留まる", () => {
    const { controller, container } = setup();
    expect(controller.scrollToKey(900)).toBe(true);
    container.flush();
    expect(container.screenTopOf(900)).toBeCloseTo(0, 5);
    expect(controller.scrollToKey(400, { offset: 30 })).toBe(true);
    container.flush();
    expect(container.screenTopOf(400)).toBeCloseTo(30, 5);
    expect(controller.getStats().corrections).toBeGreaterThan(0);
  });

  it("中央揃えのジャンプは、実測した高さで中央を求め直す", () => {
    const { controller, container } = setup();
    controller.scrollToKey(500, { align: "center" });
    container.flush();
    const center = container.screenTopOf(500) + realSizeOf(500) / 2;
    // scrollTop は整数へ丸めて書き込むため、1px未満の差は許容する。
    expect(Math.abs(center - container.height / 2)).toBeLessThan(1);
  });

  it("末尾へ追従する設定では、最下部にいる間は新着と実測の後も最下部に留まる", () => {
    const { controller, container } = setup(100);
    controller.setStickToEnd(true);
    controller.scrollToEnd();
    container.flush();
    controller.setItems(keysOf(130), () => "w800");
    container.flush();
    expect(container.scrollTop).toBe(container.scrollHeight - container.height);
  });

  it("追従しない設定では、最下部にいても新着で読んでいる位置は動かない", () => {
    const { controller, container } = setup(100);
    controller.scrollToEnd();
    container.flush();
    const key = container.topVisibleKey();
    const before = container.screenTopOf(key);
    controller.setItems(keysOf(130), () => "w800");
    container.flush();
    expect(container.screenTopOf(key)).toBeCloseTo(before, 5);
  });

  it("絞り込みで見ていた項目が消えたら、次の番号の項目を先頭に見せる", () => {
    const { controller, container } = setup();
    controller.scrollToKey(501);
    container.flush();
    controller.setItems(
      keysOf(1000).filter((key) => key % 2 === 0),
      () => "w800",
    );
    container.flush();
    expect(container.topVisibleKey()).toBe(502);
    expect(container.screenTopOf(502)).toBeCloseTo(0, 5);
  });

  it("リストの上の固定ヘッダが伸びても、見ている項目の位置は変わらない", () => {
    const { container } = setup();
    container.userScrollTo(12_000);
    const key = container.topVisibleKey();
    const before = container.screenTopOf(key);
    container.listTop += 44;
    container.flush();
    expect(container.screenTopOf(key)).toBeCloseTo(before, 5);
  });

  it("描画条件が変わった項目は推定値に戻り、実測し直しても見ている項目は動かない", () => {
    const { controller, container } = setup();
    container.userScrollTo(20_000);
    const key = container.topVisibleKey();
    const before = container.screenTopOf(key);
    controller.setItems(keysOf(1000), () => "w600");
    container.flush();
    expect(container.screenTopOf(key)).toBeCloseTo(before, 5);
  });

  it("固定した項目は表示範囲の外でも描画する", () => {
    const { controller } = setup();
    controller.setPinnedKeys([800]);
    expect(controller.getSnapshot().items.some((item) => item.key === 800)).toBe(true);
  });

  it("何も描かない項目の高さ0は受け付け、不正な値は無視する", () => {
    const { controller } = setup(10);
    const total = controller.getTotalSize();
    controller.reportSizes([
      { key: 1, size: Number.NaN },
      { key: 2, size: -1 },
    ]);
    expect(controller.getTotalSize()).toBe(total);
    controller.reportSizes([{ key: 1, size: 0 }]);
    expect(controller.getTotalSize()).toBe(total - realSizeOf(1));
  });

  it("非表示の間に scrollTop が失われても、再表示でアンカーの位置へ戻す", () => {
    const { controller, container } = setup();
    container.userScrollTo(15_000);
    const key = container.topVisibleKey();
    const before = container.screenTopOf(key);
    // display:none の間にブラウザが scrollTop を0へ戻した状態を再現する。
    container.scrollTop = 0;
    controller.updateViewport(container.viewport(), { preserveAnchor: true });
    container.flush();
    expect(container.screenTopOf(key)).toBeCloseTo(before, 5);
  });

  it("並びにない項目へのジャンプは false を返す", () => {
    const { controller } = setup(10);
    expect(controller.scrollToKey(99)).toBe(false);
  });
});
