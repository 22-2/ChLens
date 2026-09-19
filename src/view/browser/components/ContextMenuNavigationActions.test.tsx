import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ContextMenuNavigationActions } from "src/view/browser/components/ContextMenuNavigationActions";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

describe("ContextMenuNavigationActions", () => {
  afterEach(() => {
    cleanup();
  });

  it("履歴と更新の状態をアイコンの無効状態へ反映する", () => {
    render(
      <ContextMenuNavigationActions
        canGoBack={false}
        canGoForward={true}
        canRefresh={false}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "戻る" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "進む" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "更新" })).toBeDisabled();
  });

  it("各アイコンのクリックを対応する操作へ渡す", () => {
    const onBack = vi.fn();
    const onForward = vi.fn();
    const onRefresh = vi.fn();

    render(
      <ContextMenuNavigationActions
        canGoBack
        canGoForward
        canRefresh
        onBack={onBack}
        onForward={onForward}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "進む" }));
    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onForward).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
