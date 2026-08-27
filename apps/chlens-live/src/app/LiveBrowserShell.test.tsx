import { describe, expect, it, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { LiveBrowserShell, type LiveTab } from "./LiveBrowserShell";

const tabs: LiveTab[] = [
  { id: "board", title: "実況板", page: "threadList", url: "https://example.test/board/" },
  { id: "thread", title: "実況スレ", page: "thread", url: "https://example.test/thread/1" },
];

describe("LiveBrowserShell", () => {
  it("keeps the tab bar and URL bar visible around one content view", () => {
    render(
      <LiveBrowserShell
        tabs={tabs}
        activeTabId="board"
        address={tabs[0].url}
        onAddressChange={vi.fn()}
        onAddressSubmit={vi.fn()}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        toolbar={<button type="button">Overlay</button>}
      >
        <div data-testid="single-content-view">ThreadListView</div>
      </LiveBrowserShell>,
    );

    expect(screen.getByRole("navigation", { name: "開いているタブ" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "URL" })).toHaveValue(tabs[0].url);
    expect(screen.getByRole("region", { name: "コンテンツエリア" })).toContainElement(
      screen.getByTestId("single-content-view"),
    );
    expect(screen.getByRole("button", { name: "Overlay" })).toBeVisible();
  });
});
