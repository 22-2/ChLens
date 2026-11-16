import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const sources = vi.hoisted(() => ({ archive: vi.fn(), current: vi.fn() }));
vi.mock("src/features/archive-replay/browser/edge-archive-source", () => ({
  fetchEdgeArchive: sources.archive,
  fetchEdgeCurrentThreads: sources.current,
}));

import { ReplayPreparationDialog } from "./ReplayPreparationDialog";

afterEach(() => cleanup());

describe("リプレイ準備", () => {
  it("検索した候補を選び直して渡し、取得失敗を表示する", async () => {
    sources.archive.mockResolvedValue({
      threads: [
        {
          threadUrl: "https://example.com/test/read.cgi/example/1601000000/",
          title: "架空番組 ★1",
          createdAtSeconds: 1601000000,
          responseCount: 200,
        },
      ],
      truncated: false,
    });
    sources.current.mockRejectedValue(new Error("取得失敗"));
    const apply = vi.fn();
    render(<ReplayPreparationDialog onClose={vi.fn()} onApply={apply} />);
    fireEvent.change(screen.getByLabelText("検索語"), { target: { value: "架空番組" } });
    fireEvent.change(screen.getByLabelText("開始日時（日本時間）"), {
      target: { value: "2020-09-25T00:00" },
    });
    fireEvent.change(screen.getByLabelText("終了日時（日本時間）"), {
      target: { value: "2020-09-26T23:59" },
    });
    fireEvent.click(screen.getByRole("button", { name: "候補を集める" }));
    expect(await screen.findByText("現行スレ一覧を取得できませんでした。")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "この内容を使う" })).toBeDisabled();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "この内容を使う" }));
    expect(apply).toHaveBeenCalledWith([expect.objectContaining({ kind: "search-match" })]);
  });
});
