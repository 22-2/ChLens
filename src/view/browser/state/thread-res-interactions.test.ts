import { describe, expect, it, vi } from "vite-plus/test";

import { getThreadResInteractions, registerThreadResInteractions } from "./thread-res-interactions";

describe("抽出レスのポップアップ操作", () => {
  it("対象タブとスレだけに操作を渡し、古い画面の解除で新しい登録を消さない", () => {
    const old = { showAnchor: vi.fn(), hideAnchor: vi.fn(), openReplies: vi.fn() };
    const current = { showAnchor: vi.fn(), hideAnchor: vi.fn(), openReplies: vi.fn() };
    const removeOld = registerThreadResInteractions("tab", "https://example.com/old", old);
    const removeCurrent = registerThreadResInteractions("tab", "https://example.com/new", current);
    removeOld();
    expect(getThreadResInteractions("tab", "https://example.com/old")).toBeUndefined();
    expect(getThreadResInteractions("other", "https://example.com/new")).toBeUndefined();
    expect(getThreadResInteractions("tab", "https://example.com/new")).toBe(current);
    removeCurrent();
    expect(getThreadResInteractions("tab", "https://example.com/new")).toBeUndefined();
  });
});
