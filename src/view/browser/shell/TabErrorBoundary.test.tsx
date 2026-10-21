import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabErrorBoundary } from "src/view/browser/shell/TabErrorBoundary";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
const dispatch = vi.fn();

vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: logError }),
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabDispatch: () => dispatch,
}));

const PAGE_KEY = "thread:https://example.com/test/read.cgi/a/1/";

function Broken(): never {
  throw new Error("描画に失敗");
}

describe("TabErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    dispatch.mockClear();
    logError.mockClear();
    vi.restoreAllMocks();
  });

  it("子の描画例外を受け止め、そのタブだけを閉じる導線を出す", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <TabErrorBoundary tabId="tab-1" pageKey={PAGE_KEY}>
        <Broken />
      </TabErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("このページを表示できませんでした。");
    fireEvent.click(screen.getByRole("button", { name: "このタブを閉じる" }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ tabId: "tab-1" });
  });

  it("描画に失敗したページのキーを、例外とともに記録する", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <TabErrorBoundary tabId="tab-1" pageKey={PAGE_KEY}>
        <Broken />
      </TabErrorBoundary>,
    );

    expect(logError).toHaveBeenCalledWith(
      `タブの描画に失敗しました (${PAGE_KEY}):`,
      expect.objectContaining({ message: "描画に失敗" }),
      expect.any(String),
    );
  });

  it("例外が無い間は子をそのまま描画する", () => {
    render(
      <TabErrorBoundary tabId="tab-1" pageKey={PAGE_KEY}>
        <p>本文</p>
      </TabErrorBoundary>,
    );

    expect(screen.getByText("本文")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
