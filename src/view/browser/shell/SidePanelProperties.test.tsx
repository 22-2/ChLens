import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { SidePanelProperties } from "src/view/browser/shell/SidePanelProperties";
import { publishThreadSnapshot, useThreadSnapshots } from "src/view/browser/state/thread-snapshot";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({ dispatch: mocks.dispatch }),
}));
vi.mock("src/features/thread/ui/MomentumLineChart", () => ({ MomentumLineChart: () => null }));

const page = {
  type: "thread" as const,
  title: "テストスレ",
  threadUrl: "https://example.com/test/read.cgi/board/1/",
};
const responses: IRes[] = [
  { num: 1, name: "", mail: "", date: "2026/10/27(火) 09:00:00", message: "" },
  { num: 2, name: "", mail: "", date: "2026/10/27(火) 10:30:00", message: "" },
  { num: 3, name: "", mail: "", date: "2026/10/27(火) 11:00:00", message: "" },
];

function publish(patch: Partial<Parameters<typeof publishThreadSnapshot>[2]> = {}) {
  publishThreadSnapshot("tab", Symbol(), {
    threadUrl: page.threadUrl,
    responses,
    visibleResponses: responses.slice(0, 1),
    updatedAt: new Date(2026, 9, 27, 12, 0).valueOf(),
    loading: false,
    error: null,
    expired: false,
    ...patch,
  });
}

function valueOf(label: string): string | null {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent ?? null;
}

describe("スレプロパティ", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useThreadSnapshots.setState({ entries: new Map() });
  });

  it("NGで隠れたレスも含めてスレ全体の情報を表示する", () => {
    publish();
    render(<SidePanelProperties tabId="tab" page={page} />);
    expect(valueOf("スレ名")).toBe("テストスレ");
    expect(valueOf("レス数")).toBe("3");
    expect(valueOf("作成日時")).toBe("2026/10/27 09:00");
    expect(valueOf("最終レス")).toBe("2026/10/27 11:00");
    expect(valueOf("状態")).toBe("取得済み");
    // 経過時間は描画時刻ではなく、本文が情報を公開した時刻を基準にする。
    expect(valueOf("経過時間")).toBe("3時間0分");
    expect(valueOf("最終更新")).toBe("2026/10/27 12:00");
  });

  it("板を操作中のペインで開く", () => {
    publish();
    render(<SidePanelProperties tabId="tab" page={page} />);
    fireEvent.click(screen.getByRole("button", { name: "https://example.com/board/" }));
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          type: "threadList",
          boardUrl: "https://example.com/board/",
        }),
      }),
    );
  });

  it("投稿日時を読み取れない項目は不明と表示する", () => {
    publish({ responses: [{ num: 1, name: "", mail: "", date: "", message: "" }], expired: true });
    render(<SidePanelProperties tabId="tab" page={page} />);
    expect(valueOf("作成日時")).toBe("不明");
    expect(valueOf("勢い")).toBe("不明");
    expect(valueOf("状態")).toBe("dat落ち");
  });

  it("別スレの情報を表示しない", () => {
    publish({ threadUrl: "https://example.com/test/read.cgi/board/2/" });
    render(<SidePanelProperties tabId="tab" page={page} />);
    expect(screen.getByText("スレッドの情報を取得できません。")).toBeInTheDocument();
    expect(screen.queryByText("テストスレ")).not.toBeInTheDocument();
  });
});
