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
    render(
      <ThreadView
        title="実況スレ ★1"
        posts={posts}
        loading={false}
        error={null}
        datFall={false}
        onRefresh={() => undefined}
        onStop={() => undefined}
      />,
    );
    expect(screen.getByText("実況スレ ★1")).toBeVisible();
    expect(screen.getByText(/1行目/)).toBeVisible();
    expect(screen.getByText(">>1 への返信")).toBeVisible();
  });

  it("エラー時は再試行ボタンを表示する", async () => {
    const onRefresh = vi.fn();
    render(
      <ThreadView
        title="実況スレ"
        posts={[]}
        loading={false}
        error={new Error("boom")}
        datFall={false}
        onRefresh={onRefresh}
        onStop={() => undefined}
      />,
    );
    await userEvent.click(screen.getByText("再試行"));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("dat落ち表示と停止操作を扱える", async () => {
    const onStop = vi.fn();
    render(
      <ThreadView
        title="過去ログ"
        posts={posts}
        loading={false}
        error={null}
        datFall={true}
        onRefresh={() => undefined}
        onStop={onStop}
      />,
    );
    expect(screen.getByText("dat落ち")).toBeVisible();
    await userEvent.click(screen.getByText("停止"));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
