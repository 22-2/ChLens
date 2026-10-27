import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { CORE_PAGE_TYPE_DEFINITIONS } from "src/view/browser/core-page-type-definitions";
import { CommandRegistry } from "src/view/browser/extension/command-registry";
import { createExtensionOwner } from "src/view/browser/extension/extension-api";
import { renderPage } from "src/view/browser/shell/page-renderers";
import { createHomeTab } from "src/view/browser/types";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/view/browser/pages/BoardListPage", () => ({ BoardListPage: () => null }));
vi.mock("src/view/browser/pages/BookmarkListPage", () => ({ BookmarkListPage: () => null }));
vi.mock("src/view/browser/pages/HistoryListPage", () => ({ HistoryListPage: () => null }));
vi.mock("src/view/browser/pages/HomeTabPage", () => ({ HomeTabPage: () => null }));
vi.mock("src/view/browser/pages/LogListPage", () => ({ LogListPage: () => null }));
vi.mock("src/view/browser/pages/SettingsPage", () => ({ SettingsPage: () => <div>設定画面</div> }));
vi.mock("src/view/browser/pages/ThreadListPage", () => ({ ThreadListPage: () => null }));
vi.mock("src/view/browser/pages/ThreadPage", () => ({ ThreadPage: () => null }));
vi.mock("src/view/browser/pages/WriteHistoryListPage", () => ({
  WriteHistoryListPage: () => null,
}));

describe("未登録ページの描画", () => {
  it("既知の描画先があっても未登録なら代替表示し、再登録後に表示できる", () => {
    const page = { type: "settings" as const, title: "設定" };
    const tab = createHomeTab("tab");
    const context = {
      tab,
      isActive: true,
      isOverlayTarget: false,
      scrollContainerRef: { current: null },
    };
    const owner = createExtensionOwner("settings-test", new CommandRegistry());
    const { rerender } = render(<>{renderPage(page, context)}</>);
    expect(screen.getByRole("status")).toHaveTextContent("このページは現在利用できません。");
    try {
      owner.api.registerPageType("settings", CORE_PAGE_TYPE_DEFINITIONS.settings);
      rerender(<>{renderPage(page, context)}</>);
      expect(screen.getByText("設定画面")).toBeInTheDocument();
      owner.dispose();
      rerender(<>{renderPage(page, context)}</>);
      expect(screen.getByRole("status")).toHaveTextContent("このページは現在利用できません。");
    } finally {
      owner.dispose();
    }
  });
});
