import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { MiniWindow } from "src/view/browser/components/MiniWindow";

afterEach(() => {
  cleanup();
});

function createAnchorRect(): DOMRect {
  return {
    left: 48,
    top: 720,
    right: 72,
    bottom: 744,
    width: 24,
    height: 24,
    x: 48,
    y: 720,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("MiniWindow", () => {
  it("Radix PopoverのContentとして既存のmini-window構造を描画する", () => {
    render(
      <MiniWindow title="設定" anchor={createAnchorRect()} onClose={vi.fn()}>
        <div>panel content</div>
      </MiniWindow>,
    );

    const window = document.querySelector<HTMLElement>(".mini-window");
    expect(window).toBeInTheDocument();
    expect(window).toHaveStyle({ width: "280px" });
    expect(window).toHaveAttribute("data-state", "open");
    expect(screen.getByText("設定")).toBeInTheDocument();
    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("外側クリックとEscapeでonCloseを呼び、トリガーのpointerdownは維持する", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const outside = document.createElement("div");
    document.body.appendChild(outside);

    render(
      <MiniWindow
        title="設定"
        anchor={createAnchorRect()}
        onClose={onClose}
        triggerRef={{ current: trigger }}
      >
        <div>panel content</div>
      </MiniWindow>,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    fireEvent.pointerDown(trigger);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(outside);
    fireEvent.click(outside);
    expect(onClose).toHaveBeenCalledOnce();

    cleanup();
    onClose.mockClear();
    render(
      <MiniWindow title="設定" anchor={createAnchorRect()} onClose={onClose}>
        <div>panel content</div>
      </MiniWindow>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    trigger.remove();
    outside.remove();
  });
});
