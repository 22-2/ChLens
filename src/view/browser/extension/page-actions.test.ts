import {
  registerFilterToggle,
  registerPageTarget,
  registerThreadFilterModeToggle,
  toggleFilter as toggleFilterForTab,
  toggleThreadFilterMode,
} from "src/view/browser/extension/page-actions";
import { describe, expect, it, vi } from "vite-plus/test";

const { warn, error } = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("src/app/logger", () => ({ createLogger: () => ({ warn, error }) }));

describe("ページのフィルター操作", () => {
  it("窓とタブを指定し、解除後は他の対象へ送らない", () => {
    const otherWindow = document.implementation.createHTMLDocument().defaultView ?? ({} as Window);
    const first = vi.fn();
    const second = vi.fn();
    const detached = vi.fn();
    const disposeFirst = registerFilterToggle(window, "one", first);
    const disposeSecond = registerFilterToggle(window, "two", second);
    const disposeDetached = registerFilterToggle(otherWindow, "one", detached);
    try {
      expect(toggleFilterForTab(window, "two")).toBe("executed");
      expect(second).toHaveBeenCalledOnce();
      expect(first).not.toHaveBeenCalled();
      expect(detached).not.toHaveBeenCalled();
      expect(toggleFilterForTab(otherWindow, "one")).toBe("executed");
      expect(detached).toHaveBeenCalledOnce();
      disposeSecond();
      expect(toggleFilterForTab(window, "two")).toBe("target-unavailable");
      expect(first).not.toHaveBeenCalled();
      expect(detached).toHaveBeenCalledOnce();
    } finally {
      disposeFirst();
      disposeSecond();
      disposeDetached();
    }
  });

  it("表示中の未対応ページと表示終了を区別する", () => {
    const disposeTarget = registerPageTarget(window, "unsupported-tab");
    try {
      expect(toggleFilterForTab(window, "unsupported-tab")).toBe("unsupported");
      expect(warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          windowId: expect.any(Number),
          tabId: "unsupported-tab",
          result: "unsupported",
        }),
      );
      disposeTarget();
      expect(toggleFilterForTab(window, "unsupported-tab")).toBe("target-unavailable");
      expect(warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          windowId: expect.any(Number),
          tabId: "unsupported-tab",
          result: "target-unavailable",
        }),
      );
    } finally {
      disposeTarget();
    }
  });

  it("開閉とモード変更は別の操作として登録し、未対応と終了を区別する", () => {
    const disposeTarget = registerPageTarget(window, "mode-tab");
    const toggle = vi.fn();
    const mode = vi.fn();
    const ignored = vi.fn();
    const disposeToggle = registerFilterToggle(window, "mode-tab", toggle);
    const disposeMode = registerThreadFilterModeToggle(window, "mode-tab", mode);
    const disposeDuplicate = registerThreadFilterModeToggle(window, "mode-tab", ignored);
    try {
      disposeDuplicate();
      expect(toggleThreadFilterMode(window, "mode-tab", "video")).toBe("executed");
      expect(mode).toHaveBeenCalledWith("video");
      expect(ignored).not.toHaveBeenCalled();
      expect(toggle).not.toHaveBeenCalled();
      disposeMode();
      expect(toggleThreadFilterMode(window, "mode-tab", "video")).toBe("unsupported");
      expect(warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operation: "thread.filter-mode.toggle",
          tabId: "mode-tab",
          result: "unsupported",
        }),
      );
      expect(toggleFilterForTab(window, "mode-tab")).toBe("executed");
      disposeTarget();
      expect(toggleThreadFilterMode(window, "mode-tab", "video")).toBe("target-unavailable");
    } finally {
      disposeDuplicate();
      disposeMode();
      disposeToggle();
      disposeTarget();
    }
  });

  it("二重登録を拒否し、拒否された登録の解除は元の操作を消さない", () => {
    const original = vi.fn();
    const duplicate = vi.fn();
    const dispose = registerFilterToggle(window, "one", original);
    const disposeDuplicate = registerFilterToggle(window, "one", duplicate);
    try {
      disposeDuplicate();
      expect(toggleFilterForTab(window, "one")).toBe("executed");
      expect(original).toHaveBeenCalledOnce();
      expect(duplicate).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });
});
