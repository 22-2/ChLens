import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PopularFilterStatusItem } from "src/view/browser/components/PopularFilterStatusItem";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { DEFAULT_POPULAR_REPLY_THRESHOLD } from "src/view/browser/utils/popular-filter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  activeTab: { id: "tab-1" },
  currentPage: {
    type: "thread",
    title: "スレッド",
    threadUrl: "https://example.com/test/read.cgi/software/1/",
  },
  viewState: {
    filter: "popular" as "all" | "popular" | "image",
    popularReplyThreshold: undefined as number | undefined,
  },
  updateViewState: vi.fn(),
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    activeTab: mocks.activeTab,
    currentPage: mocks.currentPage,
  }),
  useTabViewState: () => ({
    state: mocks.viewState,
    update: mocks.updateViewState,
  }),
}));

function renderItem(): void {
  render(
    <StatusBarProvider>
      <PopularFilterStatusItem />
      <StatusBar />
    </StatusBarProvider>,
  );
}

describe("PopularFilterStatusItem", () => {
  beforeEach(() => {
    mocks.currentPage = {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    };
    mocks.viewState = {
      filter: "popular",
      popularReplyThreshold: undefined,
    };
    mocks.updateViewState.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("人気フィルタ以外ではステータスバーアイテムを表示しない", () => {
    mocks.viewState.filter = "image";

    renderItem();

    expect(screen.queryByRole("button", { name: /人気レス/ })).toBeNull();
  });

  it("人気フィルタ有効時は既定の閾値を表示する", () => {
    renderItem();

    expect(screen.getByRole("button", { name: "人気レス 3件以上" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "人気レス 3件以上" })).toHaveTextContent(
      `≥${DEFAULT_POPULAR_REPLY_THRESHOLD}`,
    );
  });

  it("ミニウィンドウのスライダーから閾値を更新する", () => {
    renderItem();

    fireEvent.click(screen.getByRole("button", { name: /人気レス/ }));
    const slider = screen.getByRole("slider", { name: "人気レス閾値" });
    expect(slider).toHaveValue(String(DEFAULT_POPULAR_REPLY_THRESHOLD));

    fireEvent.change(slider, { target: { value: "8" } });

    expect(mocks.updateViewState).toHaveBeenCalledWith({ popularReplyThreshold: 8 });
  });

  it("スレッド以外では表示しない", () => {
    mocks.currentPage = {
      type: "home",
      title: "ホーム",
      threadUrl: "",
    };

    renderItem();

    expect(screen.queryByRole("button", { name: /人気レス/ })).toBeNull();
  });
});
