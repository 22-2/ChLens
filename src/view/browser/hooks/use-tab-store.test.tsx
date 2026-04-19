import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("TabProvider auto refresh state", () => {
  beforeEach(() => {
    localStorage.removeItem("readcrx_browser_session");
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("現在のスレッドURLにだけ自動更新を束縛する", async () => {
    vi.resetModules();
    const { TabProvider, useTabStore } = await import(
      "src/view/browser/hooks/use-tab-store"
    );

    function Harness() {
      const { activeTab, currentPage, dispatch } = useTabStore();
      const isCurrentThreadAutoRefreshEnabled =
        currentPage.type === "thread" &&
        activeTab.autoRefreshEnabled &&
        activeTab.autoRefreshThreadUrl === currentPage.threadUrl;

      return (
        <>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-1",
                  threadUrl: "https://example.com/test/read.cgi/foo/1/",
                },
              })
            }
          >
            thread-1 へ移動
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "SET_AUTO_REFRESH_ENABLED",
                enabled: true,
                threadUrl: "https://example.com/test/read.cgi/foo/1/",
              })
            }
          >
            thread-1 で自動更新ON
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                page: {
                  type: "thread",
                  title: "thread-2",
                  threadUrl: "https://example.com/test/read.cgi/foo/2/",
                },
              })
            }
          >
            thread-2 へ移動
          </button>
          <output data-testid="stored-thread-url">
            {activeTab.autoRefreshThreadUrl ?? ""}
          </output>
          <output data-testid="current-thread-enabled">
            {isCurrentThreadAutoRefreshEnabled ? "enabled" : "disabled"}
          </output>
        </>
      );
    }

    render(
      <TabProvider>
        <Harness />
      </TabProvider>,
    );

    fireEvent.click(screen.getByText("thread-1 へ移動"));
    fireEvent.click(screen.getByText("thread-1 で自動更新ON"));

    expect(screen.getByTestId("stored-thread-url")).toHaveTextContent(
      "https://example.com/test/read.cgi/foo/1/",
    );
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent(
      "enabled",
    );

    fireEvent.click(screen.getByText("thread-2 へ移動"));

    expect(screen.getByTestId("stored-thread-url")).toHaveTextContent(
      "https://example.com/test/read.cgi/foo/1/",
    );
    expect(screen.getByTestId("current-thread-enabled")).toHaveTextContent(
      "disabled",
    );
  });
});
