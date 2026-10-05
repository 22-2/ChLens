import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { OperationStatusItem } from "src/view/browser/components/OperationStatusItem";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { afterEach, describe, expect, it } from "vite-plus/test";

function StatusHarness({ loading, active = true }: { loading: boolean; active?: boolean }) {
  return (
    <StatusBarProvider>
      <OperationStatusItem
        id="thread-fetch-status-tab-a"

        message={loading ? "スレッドを読み込み中..." : null}
        busy={loading}
        visible={active}
      />
      <OperationStatusItem
        id="write-operation-status"

        message="書き込みました"
      />
      <StatusBar />
    </StatusBarProvider>
  );
}

describe("共通の通信ステータス", () => {
  afterEach(cleanup);

  it("再取得のたびに進捗を表示し、完了しても書き込み結果は消さない", () => {
    const { rerender } = render(<StatusHarness loading={false} />);
    for (let refresh = 0; refresh < 3; refresh++) {
      rerender(<StatusHarness loading />);
      const progress = screen.getByText("スレッドを読み込み中...").closest('[role="status"]');
      expect(progress?.querySelector(".icon--spinning")).not.toBeNull();
      expect(screen.queryByText("書き込みました")).not.toBeInTheDocument();
      expect(screen.getAllByRole("status")).toHaveLength(1);
      rerender(<StatusHarness loading={false} />);
      expect(screen.queryByText("スレッドを読み込み中...")).not.toBeInTheDocument();
      expect(screen.getByText("書き込みました")).toBeInTheDocument();
    }
  });

  it("通信中のタブを非表示にしたら登録を外し、戻したときだけ再表示する", () => {
    const { rerender, unmount } = render(<StatusHarness loading />);
    rerender(<StatusHarness loading active={false} />);
    expect(screen.queryByText("スレッドを読み込み中...")).not.toBeInTheDocument();
    expect(screen.getByText("書き込みました")).toBeInTheDocument();
    rerender(<StatusHarness loading />);
    expect(screen.getByText("スレッドを読み込み中...")).toBeInTheDocument();
    unmount();
    expect(screen.queryByText("スレッドを読み込み中...")).not.toBeInTheDocument();
  });

  it("失敗は共通のエラー表示で通知し、文言更新後も一件だけ表示する", () => {
    const content = (message: string) => (
      <StatusBarProvider>
        <OperationStatusItem id="operation" message={message} isError />
        <StatusBar />
      </StatusBarProvider>
    );
    const { rerender } = render(content("通信に失敗しました"));
    expect(screen.getByRole("alert")).toHaveTextContent("通信に失敗しました");
    expect(screen.getByRole("alert").closest(".status-bar__item")).toHaveClass(
      "operation-status--error",
    );
    rerender(content("再試行に失敗しました"));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("再試行に失敗しました");
  });

  it("エラーを通信より優先し、解除後は継続中の通信へ戻す", () => {
    const content = (error: string | null) => (
      <StatusBarProvider>
        <OperationStatusItem id="write" message={error} isError />
        <OperationStatusItem id="fetch" message="スレッドを読み込み中..." busy />
        <StatusBar />
      </StatusBarProvider>
    );
    const { rerender } = render(content("書き込みに失敗しました"));
    expect(screen.getByRole("alert")).toHaveTextContent("書き込みに失敗しました");
    expect(screen.queryByText("スレッドを読み込み中...")).not.toBeInTheDocument();
    rerender(content(null));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("スレッドを読み込み中...");
  });

  it("同じ優先度では最新の文言を表示し、無関係な再描画では表示を奪わない", () => {
    const content = (writeMessage: string, fetchMessage: string | null) => (
      <StatusBarProvider>
        <OperationStatusItem id="fetch" message={fetchMessage} busy />
        <OperationStatusItem id="write" message={writeMessage} busy />
        <StatusBar />
      </StatusBarProvider>
    );
    const { rerender } = render(content("書き込み中...", "スレッドを読み込み中..."));
    expect(screen.getByRole("status")).toHaveTextContent("書き込み中...");
    rerender(content("書き込み中...", "スレッドを再取得中..."));
    expect(screen.getByRole("status")).toHaveTextContent("スレッドを再取得中...");
    rerender(content("書き込み中...", "スレッドを再取得中..."));
    expect(screen.getByRole("status")).toHaveTextContent("スレッドを再取得中...");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    rerender(content("書き込み中...", null));
    expect(screen.getByRole("status")).toHaveTextContent("書き込み中...");
  });
});
