import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NextThreadSearchState } from "src/features/next-thread/browser/use-next-thread-search";
import { NextThreadSearchDialog } from "src/features/next-thread/ui/NextThreadSearchDialog";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabDispatch: () => mocks.dispatch,
}));
vi.mock("src/features/bookmark/browser/use-bookmark-revision", () => ({
  useBookmarkRevision: () => 0,
  readBookmarkStatus: () => false,
}));

const READY_STATE: NextThreadSearchState = {
  status: "ready",
  sourceThread: {
    title: "現在のスレ",
    url: "https://example.com/test/read.cgi/live/1/",
  },
  candidates: [],
  boardMessage: null,
  error: null,
};

const READY_STATE_WITH_SCORE: NextThreadSearchState = {
  ...READY_STATE,
  candidates: [
    {
      thread: {
        title: "次のスレ",
        url: "https://example.com/test/read.cgi/live/2/",
        resCount: 1234,
        createdAt: 1_700_000_002_000,
      },
      reason: "number",
      similarity: 0.82,
      score: 42.6,
    },
  ],
};

describe("NextThreadSearchDialog", () => {
  afterEach(() => {
    cleanup();
    mocks.dispatch.mockClear();
    document.querySelector(".browser-shell")?.remove();
  });

  it.each(["related", "next"] as const)(
    "%s候補の中クリックはダイアログを閉じず背景タブで開く",
    (searchType) => {
      const onSelect = vi.fn();
      const onClose = vi.fn();
      render(
        <NextThreadSearchDialog
          state={{ ...READY_STATE_WITH_SCORE, searchType }}
          onClose={onClose}
          onSelect={onSelect}
        />,
      );
      const candidate = screen.getByRole("button", { name: "次のスレへ移動" });
      fireEvent(
        candidate,
        new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
      );
      expect(mocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          background: true,
          page: expect.objectContaining({
            title: "次のスレ",
            threadUrl: "https://example.com/test/read.cgi/live/2/",
          }),
        }),
      );
      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it.each(["related", "next"] as const)(
    "%s候補を右クリックするとスレッドのメニューを表示する",
    async (searchType) => {
      const onSelect = vi.fn();
      render(
        <NextThreadSearchDialog
          state={{ ...READY_STATE_WITH_SCORE, searchType }}
          onClose={() => {}}
          onSelect={onSelect}
        />,
      );
      fireEvent.contextMenu(screen.getByRole("button", { name: "次のスレへ移動" }), {
        clientX: 30,
        clientY: 40,
      });
      expect(await screen.findByRole("button", { name: "スレタイをコピー" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "スレタイをNG登録" })).toBeInTheDocument();
      expect(onSelect).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "スレタイをNG登録" }));
      expect(screen.getByRole("textbox", { name: "スレタイ" })).toHaveValue("次のスレ");
    },
  );

  it("ダークテーマのスコープ内へPortalを描画する", async () => {
    const shell = document.createElement("div");
    shell.className = "browser-shell";
    shell.dataset.theme = "dark";
    document.body.appendChild(shell);

    render(<NextThreadSearchDialog state={READY_STATE} onClose={() => {}} onSelect={() => {}} />);

    await waitFor(() => {
      expect(shell.querySelector(".browser-dialog-content")).not.toBeNull();
    });
    expect(document.body.querySelector(":scope > .browser-dialog-content")).toBeNull();
  });

  it("スコアの数値だけを専用要素で表示する", async () => {
    const shell = document.createElement("div");
    shell.className = "browser-shell";
    document.body.appendChild(shell);

    render(
      <NextThreadSearchDialog
        state={READY_STATE_WITH_SCORE}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    await waitFor(() => {
      expect(shell.querySelector(".next-thread-search-dialog__candidate-score")).not.toBeNull();
    });

    const score = shell.querySelector<HTMLElement>(".next-thread-search-dialog__candidate-score");
    expect(score).toHaveTextContent("43");
    expect(score?.parentElement).toHaveTextContent("1,234レス ・ 一致度 82% ・ スコア 43");
  });
});
