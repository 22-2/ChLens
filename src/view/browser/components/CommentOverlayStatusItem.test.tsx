import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import type { Page } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const THREAD_URL = "https://example.com/test/read.cgi/software/1/";

const mocks = vi.hoisted(() => ({
  isTauri: true,
  currentPage: {
    type: "thread",
    title: "スレッド",
    threadUrl: "https://example.com/test/read.cgi/software/1/",
  } as Page,
  snapshot: {
    state: {
      status: "idle" as "idle" | "running" | "stopped",
      targetThreadUrl: null as string | null,
      cursor: null as { threadUrl: string; lastResponseNumber: number } | null,
    },
    visible: false,
    error: null as string | null,
  },
  controller: {
    getSnapshot: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    setVisible: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("src/app/platform/runtime", () => ({
  isTauriRuntime: () => mocks.isTauri,
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({ currentPage: mocks.currentPage }),
}));

vi.mock("src/features/comment-overlay/application/use-comment-overlay", () => ({
  useCommentOverlay: () => ({
    controller: mocks.controller,
    snapshot: mocks.snapshot,
  }),
}));

import { CommentOverlayStatusItem } from "src/view/browser/components/CommentOverlayStatusItem";

function renderItem(): void {
  render(
    <StatusBarProvider>
      <CommentOverlayStatusItem isActive />
      <StatusBar />
    </StatusBarProvider>,
  );
}

describe("CommentOverlayStatusItem", () => {
  beforeEach(() => {
    mocks.isTauri = true;
    mocks.currentPage = {
      type: "thread",
      title: "スレッド",
      threadUrl: THREAD_URL,
    };
    mocks.snapshot = {
      state: {
        status: "idle",
        targetThreadUrl: null,
        cursor: null,
      },
      visible: false,
      error: null,
    };
    mocks.controller.start.mockClear();
    mocks.controller.getSnapshot.mockClear();
    mocks.controller.getSnapshot.mockImplementation(() => mocks.snapshot);
    mocks.controller.stop.mockClear();
    mocks.controller.setVisible.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("Browser版では実況操作を表示しない", () => {
    mocks.isTauri = false;

    renderItem();

    expect(screen.queryByRole("button", { name: /コメント実況/ })).toBeNull();
  });

  it("スレッド以外では実況操作を表示しない", () => {
    mocks.currentPage = { type: "home", title: "ホーム" };

    renderItem();

    expect(screen.queryByRole("button", { name: /コメント実況/ })).toBeNull();
  });

  it("スレッドでは自動更新と連動する実況状態を表示する", () => {
    renderItem();

    fireEvent.click(screen.getByRole("button", { name: /コメントOverlay制御/ }));

    expect(screen.getByLabelText("コメント実況: OFF")).toBeInTheDocument();
    expect(screen.getByText("スレッド自動更新と連動して新着レスを流します")).toBeInTheDocument();
    expect(mocks.controller.start).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "コメントOverlayを表示" })).toBeDisabled();
  });

  it("実況中は停止とOverlay表示切り替えを同じステータスバーへ表示する", () => {
    mocks.snapshot = {
      state: {
        status: "running",
        targetThreadUrl: THREAD_URL,
        cursor: { threadUrl: THREAD_URL, lastResponseNumber: 3 },
      },
      visible: false,
      error: null,
    };

    renderItem();

    fireEvent.click(screen.getByRole("button", { name: /コメントOverlay制御/ }));
    fireEvent.click(screen.getByRole("button", { name: "コメントOverlayを表示" }));

    expect(screen.getByLabelText("コメント実況: ON")).toBeInTheDocument();
    expect(mocks.controller.setVisible).toHaveBeenCalledWith(true);
  });

  it("表示中スレッドを離れると実況を停止する", () => {
    mocks.currentPage = { type: "home", title: "ホーム" };
    mocks.snapshot = {
      state: {
        status: "running",
        targetThreadUrl: THREAD_URL,
        cursor: { threadUrl: THREAD_URL, lastResponseNumber: 3 },
      },
      visible: true,
      error: null,
    };

    renderItem();

    expect(mocks.controller.stop).toHaveBeenCalledTimes(1);
  });

  it("送信エラーがあると実況エラーをステータスバーへ表示する", () => {
    mocks.snapshot = {
      state: {
        status: "running",
        targetThreadUrl: THREAD_URL,
        cursor: { threadUrl: THREAD_URL, lastResponseNumber: 3 },
      },
      visible: true,
      error: "[ChLens] コメントOverlay eventの送信に失敗しました:",
    };

    renderItem();

    fireEvent.click(screen.getByRole("button", { name: /コメント実況エラー/ }));

    expect(screen.getByText(/コメント実況エラー/)).toBeInTheDocument();
  });

  it("Overlay制御は単一アイコンから開くミニウィンドウへ収納する", () => {
    renderItem();

    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /コメントOverlay制御/ }));

    expect(screen.getByText("コメントOverlay")).toBeInTheDocument();
    expect(screen.getByText("コメント実況")).toBeInTheDocument();
    expect(screen.getByText("Overlay表示")).toBeInTheDocument();
  });
});
