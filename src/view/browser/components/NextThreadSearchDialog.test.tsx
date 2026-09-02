import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { NextThreadSearchState } from "src/view/browser/hooks/use-next-thread-search";
import { NextThreadSearchDialog } from "src/view/browser/components/NextThreadSearchDialog";
import { afterEach, describe, expect, it } from "vite-plus/test";

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
    document.querySelector(".browser-shell")?.remove();
  });

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
