import {
  registerThreadFilterToggle,
  toggleThreadFilter,
} from "src/view/browser/extension/page-actions";
import { describe, expect, it, vi } from "vite-plus/test";

describe("スレッドのフィルター操作", () => {
  it("窓とタブを指定し、解除後は他の対象へ送らない", () => {
    const otherWindow = document.implementation.createHTMLDocument().defaultView ?? ({} as Window);
    const first = vi.fn();
    const second = vi.fn();
    const detached = vi.fn();
    const disposeFirst = registerThreadFilterToggle(window, "one", first);
    const disposeSecond = registerThreadFilterToggle(window, "two", second);
    const disposeDetached = registerThreadFilterToggle(otherWindow, "one", detached);
    try {
      expect(toggleThreadFilter(window, "two")).toBe(true);
      expect(second).toHaveBeenCalledOnce();
      expect(first).not.toHaveBeenCalled();
      expect(detached).not.toHaveBeenCalled();
      expect(toggleThreadFilter(otherWindow, "one")).toBe(true);
      expect(detached).toHaveBeenCalledOnce();
      disposeSecond();
      expect(toggleThreadFilter(window, "two")).toBe(false);
      expect(first).not.toHaveBeenCalled();
      expect(detached).toHaveBeenCalledOnce();
    } finally {
      disposeFirst();
      disposeSecond();
      disposeDetached();
    }
  });

  it("二重登録を拒否し、拒否された登録の解除は元の操作を消さない", () => {
    const original = vi.fn();
    const duplicate = vi.fn();
    const dispose = registerThreadFilterToggle(window, "one", original);
    const disposeDuplicate = registerThreadFilterToggle(window, "one", duplicate);
    try {
      disposeDuplicate();
      expect(toggleThreadFilter(window, "one")).toBe(true);
      expect(original).toHaveBeenCalledOnce();
      expect(duplicate).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });
});
