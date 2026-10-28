import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SidePanelExtract } from "src/features/thread/ui/SidePanelExtract";
import { publishThreadSnapshot, useThreadSnapshots } from "src/view/browser/state/thread-snapshot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ query: "", update: vi.fn(), jump: vi.fn() }));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabViewState: () => ({ state: { sidePanelExtractQuery: mocks.query }, update: mocks.update }),
}));
vi.mock("src/view/browser/utils/thread-read-state", () => ({ requestThreadResJump: mocks.jump }));
const page = { type: "thread" as const, title: "スレ", threadUrl: "https://example.com/thread" };

describe("抽出レス", () => {
  beforeEach(() => {
    // jsdomにはレイアウトがないため、スクロール領域の大きさを与える。
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
  });
  afterEach(() => {
    cleanup();
    mocks.query = "";
    vi.restoreAllMocks();
    vi.clearAllMocks();
    useThreadSnapshots.setState({ entries: new Map() });
  });
  it("空欄なら全レスを表示し、入力をタブの状態へ保存する", () => {
    publishThreadSnapshot("tab", Symbol(), {
      threadUrl: page.threadUrl,
      responses: [{ num: 1, name: "名", mail: "", date: "", message: "テスト本文" }],
      visibleResponses: [{ num: 1, name: "名", mail: "", date: "", message: "テスト本文" }],
      updatedAt: 0,
      messageProtocol: "https:",
      blurredResNums: new Set<number>(),
      imageBlurRadius: 4,
      loading: false,
      error: null,
      expired: false,
    });
    render(<SidePanelExtract tabId="tab" page={page} />);
    expect(screen.getByText("テスト本文")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "本文" } });
    expect(mocks.update).toHaveBeenCalledWith({ sidePanelExtractQuery: "本文" });
  });
  it("本文の一致を強調し、対象タブへジャンプする", () => {
    mocks.query = "ﾃｽﾄ";
    publishThreadSnapshot("tab", Symbol(), {
      threadUrl: page.threadUrl,
      responses: [{ num: 1, name: "名", mail: "", date: "", message: "テスト本文" }],
      visibleResponses: [{ num: 1, name: "名", mail: "", date: "", message: "テスト本文" }],
      updatedAt: 0,
      messageProtocol: "https:",
      blurredResNums: new Set<number>(),
      imageBlurRadius: 4,
      loading: false,
      error: null,
      expired: false,
    });
    render(<SidePanelExtract tabId="tab" page={page} />);
    expect(screen.getByText("テスト").tagName).toBe("MARK");
    fireEvent.click(screen.getByRole("button", { name: /テスト本文/ }));
    expect(mocks.jump).toHaveBeenCalledWith(page.threadUrl, 1, "tab", true);
  });
  it("多数のレスは表示範囲だけを描画する", () => {
    const responses = Array.from({ length: 100 }, (_, index) => ({
      num: index + 1,
      name: "名",
      mail: "",
      date: "",
      message: `本文${index + 1}`,
    }));
    publishThreadSnapshot("tab", Symbol(), {
      threadUrl: page.threadUrl,
      responses,
      visibleResponses: responses,
      updatedAt: 0,
      messageProtocol: "https:",
      blurredResNums: new Set<number>(),
      imageBlurRadius: 4,
      loading: false,
      error: null,
      expired: false,
    });
    render(<SidePanelExtract tabId="tab" page={page} />);
    expect(screen.getByText("100 件")).toBeInTheDocument();
    expect(screen.getByText("本文1")).toBeInTheDocument();
    expect(screen.queryByText("本文100")).not.toBeInTheDocument();
  });
  it("別スレの結果を表示しない", () => {
    mocks.query = "本文";
    publishThreadSnapshot("tab", Symbol(), {
      threadUrl: "https://example.com/other",
      responses: [{ num: 1, name: "名", mail: "", date: "", message: "本文" }],
      visibleResponses: [{ num: 1, name: "名", mail: "", date: "", message: "本文" }],
      updatedAt: 0,
      messageProtocol: "https:",
      blurredResNums: new Set<number>(),
      imageBlurRadius: 4,
      loading: false,
      error: null,
      expired: false,
    });
    render(<SidePanelExtract tabId="tab" page={page} />);
    expect(screen.getByText("スレッドの情報を取得できません。")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
