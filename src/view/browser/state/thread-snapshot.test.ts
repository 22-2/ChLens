import { describe, expect, it } from "vite-plus/test";

import { publishThreadSnapshot, removeThreadSnapshot, useThreadSnapshots } from "./thread-snapshot";

describe("スレッド表示の共有状態", () => {
  it("タブを分け、古い所有者の解除で新しい表示を消さない", () => {
    useThreadSnapshots.setState({ entries: new Map() });
    const old = Symbol();
    const current = Symbol();
    const other = Symbol();
    const snapshot = {
      threadUrl: "https://example.com/thread",
      responses: [],
      visibleResponses: [],
      updatedAt: 0,
      replyIndex: new Map(),
      messageProtocol: "https:",
      blurredResNums: new Set<number>(),
      imageBlurRadius: 4,
      loading: false,
      error: null,
      expired: false,
    };
    publishThreadSnapshot("tab", old, snapshot);
    publishThreadSnapshot("tab", current, snapshot);
    publishThreadSnapshot("other", other, snapshot);
    removeThreadSnapshot("tab", old);
    expect(useThreadSnapshots.getState().entries.get("tab")?.owner).toBe(current);
    removeThreadSnapshot("tab", current);
    expect(useThreadSnapshots.getState().entries.has("tab")).toBe(false);
    expect(useThreadSnapshots.getState().entries.has("other")).toBe(true);
  });
});
