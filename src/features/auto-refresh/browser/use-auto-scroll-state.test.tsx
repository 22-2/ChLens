import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import {
  AutoScrollPaneStatesProvider,
  AutoScrollStateProvider,
  usePaneAutoScrollState,
  useSetAutoScrollState,
} from "./use-auto-scroll-state";

function Reader({ paneId }: { paneId: string }) {
  const state = usePaneAutoScrollState(paneId);
  return <output data-testid={paneId}>{state.canAutoScroll ? "追従中" : "待機中"}</output>;
}

function Writer() {
  const setState = useSetAutoScrollState();
  return (
    <button
      onClick={() => setState({ canAutoScroll: true, isAutoScrolling: false, isPaused: false })}
    >
      追従開始
    </button>
  );
}

describe("ペインごとの自動スクロール状態", () => {
  it("共通タブバーへ各ペインの状態を独立して伝え、ペイン削除時に破棄する", () => {
    const tree = (showFirst: boolean) => (
      <AutoScrollPaneStatesProvider>
        <Reader paneId="first" />
        <Reader paneId="second" />
        {showFirst && (
          <AutoScrollStateProvider paneId="first">
            <Writer />
          </AutoScrollStateProvider>
        )}
        <AutoScrollStateProvider paneId="second">{null}</AutoScrollStateProvider>
      </AutoScrollPaneStatesProvider>
    );
    const { rerender } = render(tree(true));
    fireEvent.click(screen.getByRole("button", { name: "追従開始" }));
    expect(screen.getByTestId("first")).toHaveTextContent("追従中");
    expect(screen.getByTestId("second")).toHaveTextContent("待機中");
    rerender(tree(false));
    expect(screen.getByTestId("first")).toHaveTextContent("待機中");
  });
});
