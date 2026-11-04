import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AuxiliaryWindowWatcherParams } from "src/features/auxiliary-window/browser/auxiliary-window-watcher";
import { useDetachedTabController } from "src/features/tabs/browser/use-detached-tab-controller";
import { WindowHost } from "src/view/browser/shell/WindowHost";
import { tabReducer } from "src/view/browser/state/tabs/tab-store-reducer";
import type { ScopedTabAction, TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { createHomeTab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  stateRef: { current: null as unknown as TabStoreState },
  listeners: new Set<() => void>(),
  open: vi.fn(),
  dispatch: vi.fn(),
  release: vi.fn(),
  focus: vi.fn(),
  watcherParams: null as AuxiliaryWindowWatcherParams | null,
  fakeWindow: null as Window | null,
  root: null as HTMLElement | null,
}));
vi.mock("src/view/browser/state/tabs/use-tab-store", async () => {
  const React = await import("react");
  return {
    useAllPanes: () =>
      React.useSyncExternalStore(
        (listener: () => void) => {
          mocks.listeners.add(listener);
          return () => mocks.listeners.delete(listener);
        },
        () => mocks.stateRef.current,
      ),
    useTabStore: () => ({ stateRef: mocks.stateRef }),
    useTabDispatch: () => mocks.dispatch,
  };
});
vi.mock("src/features/auxiliary-window/browser/use-auxiliary-window", () => ({
  openAuxiliaryWindow: mocks.open,
}));
vi.mock("src/features/auxiliary-window/browser/auxiliary-window-watcher", () => ({
  watchAuxiliaryWindow: (params: AuxiliaryWindowWatcherParams) => {
    mocks.watcherParams = params;
    return { release: mocks.release, unwatch: vi.fn() };
  },
}));
vi.mock("src/view/browser/hooks/use-theme", () => ({ useTheme: () => "light" }));
vi.mock("src/view/browser/shell/WindowShell", () => ({
  WindowShell: () => <div data-testid="window-shell" />,
}));
vi.mock("src/features/tabs/ui/WindowNavigationBridge", () => ({
  WindowNavigationBridge: () => null,
}));
vi.mock("src/view/browser/ui/Toast", () => ({ ToastProvider: () => null }));
vi.mock("src/features/auto-refresh/browser/use-auto-scroll-state", () => ({
  AutoScrollPaneStatesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function Controls() {
  const { detachTab, reattachTab } = useDetachedTabController();
  return (
    <>
      <button onClick={() => detachTab("tab-1")}>開く</button>
      <button onClick={() => reattachTab("tab-1")}>戻す</button>
    </>
  );
}

describe("WindowHost", () => {
  beforeEach(() => {
    const tab = createHomeTab("tab-1");
    mocks.stateRef.current = {
      panes: [{ id: "pane-1", tabs: [tab], activeTabId: tab.id }],
      activePaneId: "pane-1",
      windows: [{ id: "main", kind: "main", activePaneId: "pane-1" }],
      closedTabs: [],
    };
    mocks.listeners.clear();
    mocks.open.mockReset();
    mocks.dispatch.mockReset();
    mocks.release.mockReset();
    mocks.focus.mockReset();
    mocks.watcherParams = null;
    mocks.root = document.createElement("div");
    document.body.appendChild(mocks.root);
    mocks.fakeWindow = { closed: false, document, focus: mocks.focus } as unknown as Window;
    mocks.open.mockReturnValue({ window: mocks.fakeWindow, root: mocks.root });
    mocks.dispatch.mockImplementation((action: ScopedTabAction) => {
      mocks.stateRef.current = tabReducer(mocks.stateRef.current, action);
      for (const listener of mocks.listeners) listener();
    });
  });
  afterEach(() => {
    cleanup();
    mocks.root?.remove();
  });
  it("同じタブの別窓を再利用し、本窓へ戻す", () => {
    render(
      <WindowHost>
        <Controls />
      </WindowHost>,
    );
    fireEvent.click(screen.getByText("開く"));
    expect(screen.getByTestId("window-shell")).toBeInTheDocument();
    fireEvent.click(screen.getByText("開く"));
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(mocks.focus).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText("戻す"));
    expect(mocks.stateRef.current.windows).toHaveLength(1);
    expect(mocks.stateRef.current.panes[0].tabs.some((tab) => tab.id === "tab-1")).toBe(true);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it("窓の確保に失敗したらタブを移動しない", () => {
    mocks.open.mockReturnValue(null);
    render(
      <WindowHost>
        <Controls />
      </WindowHost>,
    );
    fireEvent.click(screen.getByText("開く"));
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.stateRef.current.panes[0].tabs[0].id).toBe("tab-1");
  });
  it("OSで閉じた場合は窓内のタブを履歴に残す", () => {
    render(
      <WindowHost>
        <Controls />
      </WindowHost>,
    );
    fireEvent.click(screen.getByText("開く"));
    act(() => mocks.watcherParams?.onClosed());
    expect(mocks.stateRef.current.closedTabs.map((tab) => tab.id)).toEqual(["tab-1"]);
    expect(mocks.stateRef.current.windows).toHaveLength(1);
  });
  it("別窓の再読み込みでは新しい描画先へ再接続する", () => {
    render(
      <WindowHost>
        <Controls />
      </WindowHost>,
    );
    fireEvent.click(screen.getByText("開く"));
    const nextRoot = document.createElement("div");
    document.body.appendChild(nextRoot);
    act(() => mocks.watcherParams?.onReconnect(nextRoot));
    expect(nextRoot.querySelector('[data-testid="window-shell"]')).not.toBeNull();
    expect(mocks.stateRef.current.windows).toHaveLength(2);
    nextRoot.remove();
  });
  it("本窓に連動した終了は閉じた履歴に積まない", () => {
    render(
      <WindowHost>
        <Controls />
      </WindowHost>,
    );
    fireEvent.click(screen.getByText("開く"));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
      mocks.watcherParams?.onClosed();
    });
    expect(mocks.stateRef.current.closedTabs).toEqual([]);
    expect(mocks.stateRef.current.windows).toHaveLength(2);
  });
});
