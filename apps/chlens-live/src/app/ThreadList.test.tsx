import { describe, expect, it, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThreadList } from "./ThreadList";
import type { BoardThread } from "@chlen/ch-lib";

const threads: BoardThread[] = [
  { url: "https://example.com/test/1", title: "実況スレ ★1", resCount: 120, createdAt: 1 },
  { url: "https://example.com/test/2", title: "雑談スレ", resCount: 45, createdAt: 2 },
];

describe("ThreadList", () => {
  it("スレ一覧を表示する", () => {
    render(
      <ThreadList
        threads={threads}
        loading={false}
        error={null}
        selectedUrl={null}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText("実況スレ ★1")).toBeVisible();
    expect(screen.getByText("雑談スレ")).toBeVisible();
    expect(screen.getByText("120レス")).toBeVisible();
  });

  it("読み込み中はloading表示になる", () => {
    render(
      <ThreadList
        threads={[]}
        loading={true}
        error={null}
        selectedUrl={null}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText("読み込み中…")).toBeVisible();
  });

  it("エラー時はエラー表示になる", () => {
    render(
      <ThreadList
        threads={[]}
        loading={false}
        error={new Error("boom")}
        selectedUrl={null}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("選択したスレをonSelectへ通知し、選択行を強調する", async () => {
    const onSelect = vi.fn();
    render(
      <ThreadList
        threads={threads}
        loading={false}
        error={null}
        selectedUrl={threads[0].url}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole("option", { name: /雑談スレ/ }));
    expect(onSelect).toHaveBeenCalledWith(threads[1]);
    // 選択状態はaria-selectedで判定する（class完全一致に依存しない）
    expect(screen.getByRole("option", { name: /実況スレ/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("フィルタでタイトルを絞り込める", async () => {
    render(
      <ThreadList
        threads={threads}
        loading={false}
        error={null}
        selectedUrl={null}
        onSelect={() => undefined}
      />,
    );
    await userEvent.type(screen.getByLabelText("スレタイトル絞り込み"), "雑談");
    expect(screen.queryByText("実況スレ ★1")).toBeNull();
    expect(screen.getByText("雑談スレ")).toBeVisible();
  });
});
