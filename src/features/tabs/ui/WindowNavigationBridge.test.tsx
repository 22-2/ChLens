import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { WindowNavigationBridge } from "src/features/tabs/ui/WindowNavigationBridge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  activeTabId: "tab-main",
  mainDispatch: vi.fn(),
  detachedDispatch: vi.fn(),
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({
    selectedTab: { id: mocks.activeTabId },
    dispatch: mocks.mainDispatch,
  }),
  useTabDispatchForTab: () => mocks.detachedDispatch,
}));

describe("WindowNavigationBridge", () => {
  beforeEach(() => {
    mocks.activeTabId = "tab-main";
    mocks.mainDispatch.mockReset();
    mocks.detachedDispatch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("本窓のサイドボタンをアクティブな本窓タブへ送る", () => {
    render(<WindowNavigationBridge />);

    fireEvent.mouseUp(window, { button: 3 });
    fireEvent.mouseUp(window, { button: 4 });

    expect(mocks.mainDispatch).toHaveBeenNthCalledWith(1, {
      type: "GO_BACK",
      tabId: "tab-main",
    });
    expect(mocks.mainDispatch).toHaveBeenNthCalledWith(2, {
      type: "GO_FORWARD",
      tabId: "tab-main",
    });
  });

  it("固定tabIdの別窓入力は別窓のdispatchへ送る", () => {
    render(<WindowNavigationBridge tabId="tab-detached" manageBrowserHistory={false} />);

    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });

    expect(mocks.detachedDispatch).toHaveBeenCalledWith({
      type: "GO_FORWARD",
      tabId: "tab-detached",
    });
    expect(mocks.mainDispatch).not.toHaveBeenCalled();
  });
});
