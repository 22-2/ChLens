import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { FloatingSurface } from "src/view/browser/ui/FloatingSurface";

afterEach(() => {
  cleanup();
});

describe("FloatingSurface", () => {
  it("共通のpopup属性・座標・z-indexを描画する", () => {
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 24,
        top: 36,
        right: 124,
        bottom: 136,
        width: 100,
        height: 100,
      } as DOMRect);

    try {
      render(
        <FloatingSurface
          className="res-popup"
          x={24}
          y={36}
          zIndex={10042}
          popupId="popup-1"
          onClose={vi.fn()}
        >
          <span>content</span>
        </FloatingSurface>,
      );

      const surface = screen.getByText("content").parentElement;
      expect(surface).toHaveClass("res-popup");
      expect(surface).toHaveAttribute("data-popup-surface", "true");
      expect(surface).toHaveAttribute("data-popup-id", "popup-1");
      expect(surface).toHaveStyle({ left: "24px", top: "36px", zIndex: "10042" });
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });

  it("surface lifecycleとrender propのmiddle click guardを共有する", () => {
    const onClose = vi.fn();
    const onSurfaceMouseDown = vi.fn();

    render(
      <FloatingSurface
        className="anchor-preview"
        x={0}
        y={0}
        onClose={onClose}
        onSurfaceMouseDown={onSurfaceMouseDown}
      >
        {({ armMouseLeaveCloseSuppression }) => (
          <button type="button" onClick={armMouseLeaveCloseSuppression}>
            arm guard
          </button>
        )}
      </FloatingSurface>,
    );

    const surface = screen.getByRole("button", { name: "arm guard" }).parentElement;
    if (!surface) {
      throw new Error("FloatingSurface surface was not rendered");
    }

    fireEvent.mouseDown(surface, { button: 0 });
    expect(onSurfaceMouseDown).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "arm guard" }));
    fireEvent.mouseLeave(surface, { relatedTarget: null });
    expect(onClose).not.toHaveBeenCalled();
  });
});
