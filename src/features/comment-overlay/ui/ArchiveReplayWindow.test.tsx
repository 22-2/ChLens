import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { CommentCandidate } from "../domain/comment-types";
import { ArchiveReplayWindow } from "./ArchiveReplayWindow";

const getThreadMock = vi.hoisted(() => vi.fn());

vi.mock("src/service-container", () => ({
  container: {
    thread: {
      getThread: getThreadMock,
    },
  },
}));

// 再生時計と描画schedulerを切り離し、窓の入力・シーク境界が実ログ取得へ接続されることを検証する。
vi.mock("./OverlayStage", () => ({
  DEFAULT_COMMENT_HISTORY_LIMIT: 3_000,
  OverlayStage: ({ comments }: { comments: readonly CommentCandidate[] }) => (
    <output data-testid="投入レス">
      {comments.map((comment) => comment.responseNumber).join(",")}
    </output>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("過去実況再生ウィンドウ", () => {
  beforeEach(() => {
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
    const onClose = vi.fn();
    render(
      <div className="browser-shell">
        <ArchiveReplayWindow open onClose={onClose} />
      </div>,
    );

    fireEvent.change(screen.getByLabelText("実況スレッドURL"), {
      target: { value: "https://example.com/thread-a/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "複数スレを読み込む" }));

    expect(await screen.findByText("スレ1: 架空の実況")).toBeInTheDocument();
    expect(getThreadMock).toHaveBeenCalledWith("https://example.com/thread-a/");
    expect(screen.getByTestId("投入レス")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "10秒進める" }));
    expect(screen.getByTestId("投入レス")).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: "最初から" }));
    expect(screen.getByTestId("投入レス")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "過去実況再生を閉じる" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
