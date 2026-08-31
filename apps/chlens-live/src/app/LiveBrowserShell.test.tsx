import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { LiveBrowserShell, type LiveTab } from "./LiveBrowserShell";

const tabs: LiveTab[] = [
  { id: "board", title: "実況板", page: "threadList", url: "https://example.test/board/" },
  {
    id: "thread",
    title: "実況スレ",
    page: "thread",
    url: "https://example.test/thread/1",
  },
];

function renderShell(overrides: Partial<ComponentProps<typeof LiveBrowserShell>> = {}) {
  const props: ComponentProps<typeof LiveBrowserShell> = {
    tabs,
    activeTabId: "board",
    address: tabs[0].url,
    onAddressChange: () => undefined,
    onAddressSubmit: () => undefined,
    onSelectTab: () => undefined,
    onCloseTab: () => undefined,
    toolbar: null,
    children: <div>本文</div>,
    ...overrides,
  };
  return render(<LiveBrowserShell {...props} />);
}

describe("LiveBrowserShell", () => {
  it("タブバーとURLバーで単一のコンテンツ領域を囲む", () => {
    renderShell({
      toolbar: <button type="button">Overlay</button>,
      children: <div data-testid="single-content-view">ThreadListView</div>,
    });

    expect(screen.getByRole("navigation", { name: "開いているタブ" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "URL" })).toHaveValue(tabs[0].url);
    expect(screen.getByRole("region", { name: "コンテンツエリア" })).toContainElement(
      screen.getByTestId("single-content-view"),
    );
    expect(screen.getByRole("button", { name: "Overlay" })).toBeVisible();
  });

  it("タブバーのホイールで隣のタブへ切り替える", () => {
    const onSelectTab = vi.fn();
    renderShell({ onSelectTab });

    fireEvent.wheel(screen.getByRole("navigation", { name: "開いているタブ" }), {
      deltaY: 100,
    });

    expect(onSelectTab).toHaveBeenCalledWith("thread");
  });

  it("タブの中クリックで閉じる", () => {
    const onCloseTab = vi.fn();
    renderShell({ onCloseTab });

    fireEvent.mouseDown(document.querySelector('[data-tab-id="thread"]')!, { button: 1 });

    expect(onCloseTab).toHaveBeenCalledWith("thread");
  });

  it("スレタブの先頭へ自動更新状態を表示する", () => {
    renderShell({ activeTabId: "thread", threadAutoRefreshState: "active" });

    expect(screen.getByLabelText("自動更新動作中")).toBeVisible();
  });

  it("一覧上端の連続ホイールで更新する", () => {
    vi.useFakeTimers();
    try {
      const wheelRefresh = vi.fn();
      const { container } = renderShell({ wheelRefresh, wheelEdge: "top" });
      const panel = container.querySelector(".content-area__tab-panel")!;

      for (let count = 0; count < 7; count += 1) {
        fireEvent.wheel(panel, { deltaY: -100 });
      }

      expect(wheelRefresh).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(1_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
