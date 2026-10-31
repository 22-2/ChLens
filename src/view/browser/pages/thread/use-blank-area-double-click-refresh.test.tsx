import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useBlankAreaDoubleClickRefresh } from "src/view/browser/pages/thread/use-blank-area-double-click-refresh";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

function BodyHarness({
  canRefresh = true,
  viewWindow = window,
  requestManualRefresh,
}: {
  canRefresh?: boolean;
  viewWindow?: Window;
  requestManualRefresh: () => void;
}) {
  const handleDoubleClick = useBlankAreaDoubleClickRefresh({
    canRefresh,
    viewWindow,
    requestManualRefresh,
  });
  return (
    <div onDoubleClick={handleDoubleClick} data-testid="body">
      <p>本文の空白</p>
      <a href="https://example.com/article">リンク</a>
      <button type="button">ボタン</button>
      <span className="res__thumb">サムネイル</span>
    </div>
  );
}

describe("useBlankAreaDoubleClickRefresh", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("本文の空白部分をダブルクリックすると、手動更新を要求する", () => {
    const requestManualRefresh = vi.fn();
    render(<BodyHarness requestManualRefresh={requestManualRefresh} />);

    fireEvent.doubleClick(screen.getByText("本文の空白"));

    expect(requestManualRefresh).toHaveBeenCalledTimes(1);
  });

  it("リンク・ボタン・サムネイルをダブルクリックしても、手動更新を要求しない", () => {
    const requestManualRefresh = vi.fn();
    render(<BodyHarness requestManualRefresh={requestManualRefresh} />);

    fireEvent.doubleClick(screen.getByText("リンク"));
    fireEvent.doubleClick(screen.getByRole("button", { name: "ボタン" }));
    fireEvent.doubleClick(screen.getByText("サムネイル"));

    expect(requestManualRefresh).not.toHaveBeenCalled();
  });

  it("更新できない状態では、空白部分をダブルクリックしても更新しない", () => {
    const requestManualRefresh = vi.fn();
    render(<BodyHarness canRefresh={false} requestManualRefresh={requestManualRefresh} />);

    fireEvent.doubleClick(screen.getByText("本文の空白"));

    expect(requestManualRefresh).not.toHaveBeenCalled();
  });

  it("テキストを選択中は、ダブルクリックしても更新しない", () => {
    const requestManualRefresh = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "選択中の文字",
    } as Selection);
    render(<BodyHarness requestManualRefresh={requestManualRefresh} />);

    fireEvent.doubleClick(screen.getByText("本文の空白"));

    expect(requestManualRefresh).not.toHaveBeenCalled();
  });

  it("操作中のウィンドウの選択状態で判定し、表示中の別ウィンドウの選択には影響されない", () => {
    const requestManualRefresh = vi.fn();
    const viewWindow = {
      getSelection: () => ({ toString: () => "別のウィンドウの選択" }),
    } as unknown as Window;
    render(<BodyHarness viewWindow={viewWindow} requestManualRefresh={requestManualRefresh} />);

    fireEvent.doubleClick(screen.getByText("本文の空白"));

    expect(requestManualRefresh).not.toHaveBeenCalled();
  });
});
