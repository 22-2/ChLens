import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
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

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    activeTab: { id: "tab-1" },
    currentPage: activePageRef.current,
  }),
}));

function CountWriter({ kind, count }: { kind: "thread" | "threadList"; count: number }): null {
  const { setPageCount } = usePageCountStatus();
  const key =
    kind === "threadList"
      ? getThreadListPageCountKey("tab-1", "https://example.com/board/")
      : getThreadPageCountKey("tab-1", "https://example.com/test/read.cgi/board/1/");

  useEffect(() => {
    setPageCount(key, { kind, count });
    return () => setPageCount(key, null);
  }, [count, key, kind, setPageCount]);

  return null;
}

function renderStatusBar(kind: "thread" | "threadList", count: number): void {
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
        <CountWriter kind={kind} count={count} />
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
});
