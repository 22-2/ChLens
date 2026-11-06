import { act, renderHook } from "@testing-library/react";
import { useThreadSmoothScroll } from "src/view/browser/pages/thread/use-thread-smooth-scroll";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  enabled: false,
  multiplier: "1.5",
  instances: [] as Array<{
    options: { wheelMultiplier: number; virtualScroll: (data: { event: Event }) => boolean };
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("lenis", () => ({
  default: class {
    destroy = vi.fn();
    raf = vi.fn();
    on = vi.fn(() => () => {});
    isScrolling = false;
    animatedScroll = 0;
    constructor(public options: (typeof mocks.instances)[number]["options"]) {
      mocks.instances.push(this);
    }
  },
}));
vi.mock("src/view/browser/hooks/use-config-boolean-setting", () => ({
  useConfigBooleanSetting: () => ({ value: mocks.enabled }),
}));
vi.mock("src/view/browser/utils/config-setting", () => ({
  readConfigValue: () => mocks.multiplier,
  subscribeConfigKeys: () => () => {},
}));

describe("スレの滑らかなスクロール", () => {
  beforeEach(() => {
    mocks.enabled = false;
    mocks.multiplier = "1.5";
    mocks.instances.length = 0;
  });

  it("設定が有効で表示中のスレだけに適用し、非表示時に解除する", () => {
    const wrapper = document.createElement("div");
    const root = document.createElement("div");
    wrapper.append(root);
    const options = {
      containerRef: { current: wrapper },
      rootRef: { current: root },
      isActive: true,
    };
    const { rerender } = renderHook((props) => useThreadSmoothScroll(props), {
      initialProps: options,
    });
    expect(mocks.instances).toHaveLength(0);
    mocks.enabled = true;
    rerender(options);
    expect(mocks.instances[0]?.options.wheelMultiplier).toBe(1.5);
    rerender({ ...options, isActive: false });
    expect(mocks.instances[0]?.destroy).toHaveBeenCalledOnce();
  });

  it("キャンセル済みのホイールやポップアップ内の操作を処理しない", () => {
    mocks.enabled = true;
    const wrapper = document.createElement("div");
    const root = document.createElement("div");
    const popup = document.createElement("div");
    popup.dataset.popup = "true";
    root.append(popup);
    wrapper.append(root);
    document.body.append(wrapper);
    const { unmount } = renderHook(() =>
      useThreadSmoothScroll({
        containerRef: { current: wrapper },
        rootRef: { current: root },
        isActive: true,
      }),
    );
    const handle = mocks.instances[0]!.options.virtualScroll;
    const cancelled = new WheelEvent("wheel", { cancelable: true });
    cancelled.preventDefault();
    expect(handle({ event: cancelled })).toBe(false);
    let result: boolean | undefined;
    wrapper.addEventListener("wheel", (event) => {
      result = handle({ event });
    });
    act(() => {
      popup.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    });
    expect(result).toBe(false);
    unmount();
    wrapper.remove();
  });
});
