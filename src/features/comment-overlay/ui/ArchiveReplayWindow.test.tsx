import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { MemoryArchiveReplayOverlayEventBus } from "../platform/archive-replay-events";
import type { CommentOverlayWindowPlatform } from "../platform/types";
import { ArchiveReplayWindow } from "./ArchiveReplayWindow";

const getThreadMock = vi.hoisted(() => vi.fn());

vi.mock("src/service-container", () => ({
  container: {
    config: {
      get: vi.fn(() => "dark"),
      ready: vi.fn((callback: () => void) => callback()),
    },
    message: {
      on: vi.fn(),
      off: vi.fn(),
    },
    thread: {
      getThread: getThreadMock,
    },
  },
}));

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.restoreAllMocks();
});

describe("過去実況再生ウィンドウ", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    getThreadMock.mockReset();
    getThreadMock.mockResolvedValue({
      url: "https://example.com/thread-a/",
      title: "架空の実況",
      res: [
        {
          num: 1,
          name: "名無し",
          mail: "",
          date: "2026/09/16(水) 23:30:00",
          message: "開始",
        },
        {
          num: 2,
          name: "名無し",
          mail: "",
          date: "2026/09/16(水) 23:30:10",
          message: "途中",
        },
      ],
    });
  });

  it("開始日時を省略して読み込み、レスの時刻へシークできる", async () => {
    const archiveReplayEventBus = new MemoryArchiveReplayOverlayEventBus();
    const overlayPlatform = {
      show: vi.fn(async () => {}),
      hide: vi.fn(async () => {}),
    } as unknown as CommentOverlayWindowPlatform;
    render(
      <div className="browser-shell">
        <ArchiveReplayWindow
          archiveReplayEventBus={archiveReplayEventBus}
          overlayPlatform={overlayPlatform}
          seekRequestSubscriber={async () => () => {}}
        />
      </div>,
    );

    expect(screen.getByTestId("archive-replay-window")).toHaveAttribute("data-theme", "dark");

    fireEvent.change(screen.getByLabelText("実況スレッドURL"), {
      target: { value: "https://example.com/thread-a/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "複数スレを読み込む" }));

    expect(await screen.findByText("スレ1: 架空の実況")).toBeInTheDocument();
    expect(getThreadMock).toHaveBeenCalledWith("https://example.com/thread-a/");
    expect(
      archiveReplayEventBus.events.some(
        (event) => event.type === "comment" && event.comment.responseNumber === 1,
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "10秒進める" }));
    expect(
      archiveReplayEventBus.events.some(
        (event) => event.type === "comment" && event.comment.responseNumber === 2,
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "最初から" }));
    expect(archiveReplayEventBus.events.filter((event) => event.type === "reset")).not.toHaveLength(
      0,
    );

    fireEvent.click(screen.getByRole("button", { name: "過去実況再生を閉じる" }));
    expect(overlayPlatform.hide).toHaveBeenCalled();
    expect(archiveReplayEventBus.events.some((event) => event.type === "stop")).toBe(true);
  });
});
