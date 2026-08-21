import { cleanup, render, waitFor } from "@testing-library/react";
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
});
