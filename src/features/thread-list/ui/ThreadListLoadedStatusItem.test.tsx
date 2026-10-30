import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { setThreadListLoadedAt } from "src/features/thread-list/ui/thread-list-loaded-at";
import { ThreadListLoadedStatusItem } from "src/features/thread-list/ui/ThreadListLoadedStatusItem";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import type { Page } from "src/view/browser/types";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

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

// 読み込み時刻の設定はページ側が行うため、テストでも同じ経路で状態を作る。
function LoadedAtWriter({ loadedAt }: { loadedAt: number | null }): null {
  useEffect(() => {
    setThreadListLoadedAt("tab-1", loadedAt);
    return () => setThreadListLoadedAt("tab-1", null);
  }, [loadedAt]);
  return null;
}

function renderItem(loadedAt: number | null): void {
  render(
    <StatusBarProvider>
      <LoadedAtWriter loadedAt={loadedAt} />
      <ThreadListLoadedStatusItem />
      <StatusBar />
    </StatusBarProvider>,
  );
}

describe("ThreadListLoadedStatusItem", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    activePageRef.current = {
      type: "threadList",
      boardUrl: "https://example.com/board/",
      title: "板",
      boardTitle: "板",
    };
  });

  it("スレ一覧では最終読み込みからの経過時間を表示する", async () => {
    renderItem(Date.now() - 3 * 60_000);

    expect(await screen.findByText("最終読み込み 3 分前")).toBeInTheDocument();
  });

  it("読み込み時刻がまだ無いあいだは「-」を表示する", async () => {
    renderItem(null);

    expect(await screen.findByText("最終読み込み -")).toBeInTheDocument();
  });

  it("時間の経過に合わせて相対表示を更新する", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-10-31T12:00:00+09:00"));
    renderItem(new Date("2026-10-31T12:00:00+09:00").getTime());

    expect(screen.getByText("最終読み込み まもなく")).toBeInTheDocument();

    // 1分未満でも1秒ごとに経過秒数が進む。
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText("最終読み込み 5秒前")).toBeInTheDocument();

    // fake timers は Date も進めるため、5分進めれば再描画のたびに経過時間が変わる。
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    expect(screen.getByText("最終読み込み 5 分前")).toBeInTheDocument();
  });

  it("スレ以外のページでは表示しない", async () => {
    activePageRef.current = {
      type: "thread",
      threadUrl: "https://example.com/test/read.cgi/board/1/",
      title: "スレ",
    };
    renderItem(Date.now());

    expect(screen.queryByText(/最終読み込み/)).not.toBeInTheDocument();
  });
});
