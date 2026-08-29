import { describe, expect, it, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThreadView } from "./ThreadView";
import type { IRes } from "@chlen/ch-lib";

function post(number: number, message: string): IRes {
  return { number, name: `名無し${number}`, mail: "", date: "2026/08/24", message };
}

const posts = [post(1, "1行目\n2行目"), post(2, ">>1 への返信")];

describe("ThreadView", () => {
  it("レス一覧を表示する", () => {
    render(<ThreadView posts={posts} error={null} onRefresh={() => undefined} />);
    expect(document.querySelector(".live-thread-view__toolbar")).not.toBeInTheDocument();
    expect(screen.getByText(/1行目/)).toBeVisible();
    expect(screen.getByText(">>1 への返信")).toBeVisible();
  });

  it("エラー時は再試行ボタンを表示する", async () => {
    const onRefresh = vi.fn();
    render(<ThreadView posts={[]} error={new Error("boom")} onRefresh={onRefresh} />);
    await userEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("Live独自のヘッダーを表示しない", () => {
    render(<ThreadView posts={posts} error={null} onRefresh={() => undefined} />);
    expect(screen.queryByText("dat落ち")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
