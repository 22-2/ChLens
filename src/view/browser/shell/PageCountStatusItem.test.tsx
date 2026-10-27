import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { registerFilterToggle } from "src/view/browser/extension/page-actions";
import {
  getThreadListPageCountKey,
  getThreadPageCountKey,
  PageCountStatusProvider,
  usePageCountStatus,
} from "src/view/browser/hooks/use-page-count-status";
import type { Page } from "src/view/browser/types";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PageCountStatusItem } from "./PageCountStatusItem";

const { activePageRef } = vi.hoisted(() => ({
  activePageRef: {
    current: {
      type: "threadList" as const,
      boardUrl: "https://example.com/board/",
      title: "板",
      boardTitle: "板",
    } as Page,
  },
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({
    viewTab: { id: "tab-1" },
    viewPage: activePageRef.current,
  }),
}));

function CountWriter({
  kind,
  count,
  filteredCount,
}: {
  kind: "thread" | "threadList";
  count: number;
  filteredCount?: number | null;
}): null {
  const { setPageCount } = usePageCountStatus();
  const key =
    kind === "threadList"
      ? getThreadListPageCountKey("tab-1", "https://example.com/board/")
      : getThreadPageCountKey("tab-1", "https://example.com/test/read.cgi/board/1/");

  useEffect(() => {
    setPageCount(key, { kind, count, filteredCount });
    return () => setPageCount(key, null);
  }, [count, filteredCount, key, kind, setPageCount]);

  return null;
}

function renderStatusBar(
  kind: "thread" | "threadList",
  count: number,
  filteredCount?: number | null,
): void {
  activePageRef.current =
    kind === "threadList"
      ? {
          type: "threadList",
          boardUrl: "https://example.com/board/",
          title: "板",
          boardTitle: "板",
        }
      : {
          type: "thread",
          threadUrl: "https://example.com/test/read.cgi/board/1/",
          title: "スレ",
        };

  render(
    <StatusBarProvider>
      <PageCountStatusProvider>
        <CountWriter kind={kind} count={count} filteredCount={filteredCount} />
        <PageCountStatusItem />
        <StatusBar />
      </PageCountStatusProvider>
    </StatusBarProvider>,
  );
}

describe("PageCountStatusItem", () => {
  afterEach(() => cleanup());

  it("スレ一覧では表示中のスレ数を表示する", async () => {
    renderStatusBar("threadList", 42);

    await waitFor(() => {
      expect(screen.getByText("42スレ")).toBeInTheDocument();
      expect(screen.getByLabelText("現在のスレ数: 42スレ")).toBeInTheDocument();
    });
  });

  it("スレでは取得済みのレス数を表示する", async () => {
    renderStatusBar("thread", 128);

    await waitFor(() => {
      expect(screen.getByText("128レス")).toBeInTheDocument();
      expect(screen.getByLabelText("現在のレス数: 128レス")).toBeInTheDocument();
    });
  });

  it("スレを絞り込んでいる間は表示件数と全体件数を並べて表示する", async () => {
    renderStatusBar("thread", 128, 7);

    await waitFor(() => {
      expect(screen.getByText("7/128レス")).toBeInTheDocument();
    });
  });

  it("スレのレス数をクリックすると対象タブのフィルタバーを切り替える", async () => {
    renderStatusBar("thread", 128);

    const toggle = vi.fn();
    const dispose = registerFilterToggle(window, "tab-1", toggle);
    try {
      const countButton = await screen.findByRole("button", { name: "現在のレス数: 128レス" });
      fireEvent.click(countButton);
      expect(toggle).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });
});
