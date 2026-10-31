import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ContextMenuPopupItem } from "src/features/popup/browser/popup-types";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { useThreadContextMenuHeader } from "src/view/browser/pages/thread/use-thread-context-menu-header";
import type { Tab, ThreadPage as ThreadPageType } from "src/view/browser/types";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";
const page: ThreadPageType = { type: "thread", title: "テストスレ", threadUrl: THREAD_URL };
const menu = { id: "menu-1" } as ContextMenuPopupItem;

/** 現在のページが先頭の履歴にあるか、戻る・進むで移動できる履歴を作る。 */
function createTab(historyLength: number, currentIndex: number): Tab {
  const history = Array.from({ length: historyLength }, () => page);
  return { history, currentIndex } as Tab;
}

function renderHeader(
  options: {
    navigationTab?: Tab;
    canRefresh?: boolean;
  } = {},
) {
  const requestManualRefresh = vi.fn();
  const runTabCommand = vi.fn();
  const closePopupById = vi.fn();
  const { result } = renderHook(() =>
    useThreadContextMenuHeader({
      navigationTab: options.navigationTab ?? createTab(1, 0),
      page,
      canRefresh: options.canRefresh ?? true,
      requestManualRefresh,
      runTabCommand,
      closePopupById,
    }),
  );
  return { contextMenuHeader: result, requestManualRefresh, runTabCommand, closePopupById };
}

describe("useThreadContextMenuHeader", () => {
  setupTestPageTypes();

  afterEach(() => {
    cleanup();
  });

  it("戻る・進む・更新の操作を表示し、履歴の状態に応じて無効にする", () => {
    const { contextMenuHeader } = renderHeader({ navigationTab: createTab(1, 0) });

    render(contextMenuHeader.current(menu));

    expect(screen.getByRole("button", { name: "戻る" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "進む" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();
  });

  it("履歴をさかのぼれるときは戻るを有効にし、押すと戻る操作を実行してメニューを閉じる", () => {
    const { contextMenuHeader, runTabCommand, closePopupById } = renderHeader({
      navigationTab: createTab(2, 1),
    });
    render(contextMenuHeader.current(menu));

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));

    expect(runTabCommand).toHaveBeenCalledWith(TAB_COMMAND_IDS.BACK);
    expect(closePopupById).toHaveBeenCalledWith("menu-1");
  });

  it("進める履歴があるときは進むを有効にし、押すと進む操作を実行してメニューを閉じる", () => {
    const { contextMenuHeader, runTabCommand, closePopupById } = renderHeader({
      navigationTab: createTab(2, 0),
    });
    render(contextMenuHeader.current(menu));

    fireEvent.click(screen.getByRole("button", { name: "進む" }));

    expect(runTabCommand).toHaveBeenCalledWith(TAB_COMMAND_IDS.FORWARD);
    expect(closePopupById).toHaveBeenCalledWith("menu-1");
  });

  it("更新を押すと手動更新を要求してメニューを閉じる", () => {
    const { contextMenuHeader, requestManualRefresh, closePopupById } = renderHeader();
    render(contextMenuHeader.current(menu));

    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    expect(requestManualRefresh).toHaveBeenCalledTimes(1);
    expect(closePopupById).toHaveBeenCalledWith("menu-1");
  });

  it("更新できない状態では、更新を無効にする", () => {
    const { contextMenuHeader } = renderHeader({ canRefresh: false });
    render(contextMenuHeader.current(menu));

    expect(screen.getByRole("button", { name: "更新" })).toBeDisabled();
  });
});
