import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TitleBar } from "src/view/browser/components/TitleBar";
import type { Page } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { dispatchMock, mocks } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  mocks: {
    currentPage: {
      type: "thread" as const,
      title: "Current Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/1/",
    } as Page,
    panes: [{ id: "pane-1" }],
  },
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    currentPage: mocks.currentPage,
    dispatch: dispatchMock,
  }),
  useTabPanes: () => ({ panes: mocks.panes, activePaneId: "pane-1" }),
}));

describe("TitleBar", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.currentPage = {
      type: "thread",
      title: "Current Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/1/",
    };
    mocks.panes = [{ id: "pane-1" }];
    dispatchMock.mockReset();
  });

  it("アクティブページのタイトルを中央表示し、レイアウト操作を常設する", () => {
    render(<TitleBar />);

    const titleBar = screen.getByTestId("title-bar");
    expect(titleBar).toBeInTheDocument();
    expect(screen.getByTestId("title-bar-title")).toHaveTextContent("Current Thread");
    expect(screen.getByRole("toolbar", { name: "レイアウト操作" })).toHaveClass(
      "action-toolbar-container",
    );
    expect(screen.getByRole("button", { name: "2ペインで表示" })).toBeInTheDocument();
  });

  it("1ペインと2ペインの切替を専用ボタンからdispatchする", () => {
    const { rerender } = render(<TitleBar />);

    fireEvent.click(screen.getByRole("button", { name: "2ペインで表示" }));
    expect(dispatchMock).toHaveBeenCalledWith({ type: "SPLIT_PANE" });

    mocks.panes = [{ id: "pane-1" }, { id: "pane-2" }];
    rerender(<TitleBar />);

    const closeButton = screen.getByRole("button", { name: "2ペイン表示を解除" });
    expect(closeButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(closeButton);
    expect(dispatchMock).toHaveBeenCalledWith({ type: "CLOSE_PANE" });
  });

  it("長いタイトルは省略可能なタイトル属性を持つ", () => {
    mocks.currentPage = {
      type: "thread",
      title: "長いスレッドタイトル".repeat(20),
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/1/",
    };

    render(<TitleBar />);

    const title = screen.getByTestId("title-bar-title");
    expect(title).toHaveAttribute("title", mocks.currentPage.title);
    expect(title).toHaveClass("title-bar__title");
  });
});
