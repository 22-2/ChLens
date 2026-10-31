import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThreadPageNotices } from "src/view/browser/pages/thread/ThreadPageNotices";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const defaultProps = {
  expired: false,
  missingFromSubject: false,
  error: null,
};

describe("ThreadPageNotices", () => {
  afterEach(() => {
    cleanup();
  });

  it("通知がなければ、何も表示しない", () => {
    const { container } = render(<ThreadPageNotices {...defaultProps} />);

    expect(container.childElementCount).toBe(0);
  });

  it("dat落ちしたスレッドは、本文の上に状態を伝える通知を出す", () => {
    render(<ThreadPageNotices {...defaultProps} expired />);

    expect(screen.getByRole("status")).toHaveTextContent("このスレッドはdat落ちしています");
  });

  it("subject.txt に無いスレッドも、dat落ちとして扱う", () => {
    render(<ThreadPageNotices {...defaultProps} missingFromSubject />);

    expect(screen.getByRole("status")).toHaveTextContent("このスレッドはdat落ちしています");
  });

  it("関連スレの検索が渡されていれば、dat落ちの通知から検索を実行できる", () => {
    const onSearchRelatedThreads = vi.fn().mockResolvedValue(undefined);
    render(
      <ThreadPageNotices
        {...defaultProps}
        expired
        onSearchRelatedThreads={onSearchRelatedThreads}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "関連スレを探す" }));

    expect(onSearchRelatedThreads).toHaveBeenCalledTimes(1);
  });

  it("関連スレの検索が渡されていなければ、検索ボタンを出さない", () => {
    render(<ThreadPageNotices {...defaultProps} expired />);

    expect(screen.queryByRole("button", { name: "関連スレを探す" })).not.toBeInTheDocument();
  });

  it("取得エラーは、本文の上にそのまま表示する", () => {
    render(<ThreadPageNotices {...defaultProps} error="スレッドの取得に失敗しました" />);

    expect(screen.getByText("スレッドの取得に失敗しました")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
