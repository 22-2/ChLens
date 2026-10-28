import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { ThreadSnapshotGate } from "src/view/browser/components/ThreadSnapshotGate";
import {
  publishThreadSnapshot,
  type ThreadSnapshot,
  useThreadSnapshots,
} from "src/view/browser/state/thread-snapshot";
import { afterEach, describe, expect, it } from "vite-plus/test";

const threadUrl = "https://example.com/thread";

function publish(patch: Partial<ThreadSnapshot> = {}) {
  publishThreadSnapshot("tab", Symbol(), {
    threadUrl,
    responses: [{ num: 1, name: "", mail: "", date: "", message: "本文" }],
    visibleResponses: [],
    updatedAt: 0,
    replyIndex: new Map(),
    messageProtocol: "https:",
    blurredResNums: new Set<number>(),
    imageBlurRadius: 4,
    loading: false,
    error: null,
    expired: false,
    ...patch,
  });
}

function renderGate() {
  return render(
    <ThreadSnapshotGate tabId="tab" threadUrl={threadUrl}>
      {(snapshot) => <div>レス {snapshot.responses.length} 件</div>}
    </ThreadSnapshotGate>,
  );
}

describe("スナップショットの表示判定", () => {
  afterEach(() => {
    cleanup();
    useThreadSnapshots.setState({ entries: new Map() });
  });

  it("別スレのスナップショットは使わない", () => {
    publish({ threadUrl: "https://example.com/other" });
    renderGate();
    expect(screen.getByText("スレッドの情報を取得できません。")).toBeInTheDocument();
  });

  it("読み込み中はその旨を表示する", () => {
    publish({ loading: true });
    renderGate();
    expect(screen.getByText("スレッドを読み込み中…")).toBeInTheDocument();
  });

  it("レスがなく取得に失敗したらエラーを表示する", () => {
    publish({ responses: [], error: "取得失敗" });
    renderGate();
    expect(screen.getByText("取得失敗")).toBeInTheDocument();
  });

  it("取得済みのレスがあれば、更新に失敗しても表示を続ける", () => {
    publish({ error: "取得失敗" });
    renderGate();
    expect(screen.getByText("レス 1 件")).toBeInTheDocument();
  });
});
