import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FloatingPopup } from "src/view/browser/ui/FloatingPopup";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  cleanup();
});

describe("FloatingPopup", () => {
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
        <FloatingPopup
          className="res-popup"
          x={24}
          y={36}
          zIndex={10042}
          popupId="popup-1"
          onClose={vi.fn()}
        >
          <span>content</span>
        </FloatingPopup>,
      );

      const popup = screen.getByText("content").parentElement;
      expect(popup).toHaveClass("res-popup");
      expect(popup).toHaveAttribute("data-popup", "true");
      expect(popup).toHaveAttribute("data-popup-id", "popup-1");
      expect(popup).toHaveStyle({ left: "24px", top: "36px", zIndex: "10042" });
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });

  it("close behaviorとrender propのmiddle click guardを共有する", () => {
    const onClose = vi.fn();
    const onPopupMouseDown = vi.fn();

    render(
      <FloatingPopup
        className="anchor-preview"
        x={0}
        y={0}
        onClose={onClose}
        onPopupMouseDown={onPopupMouseDown}
      >
        {({ armMouseLeaveCloseSuppression }) => (
          <button type="button" onClick={armMouseLeaveCloseSuppression}>
            arm guard
          </button>
        )}
      </FloatingPopup>,
    );

    const popup = screen.getByRole("button", { name: "arm guard" }).parentElement;
    if (!popup) {
      throw new Error("FloatingPopup popup was not rendered");
    }

    fireEvent.mouseDown(popup, { button: 0 });
    expect(onPopupMouseDown).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "arm guard" }));
    fireEvent.mouseLeave(popup, { relatedTarget: null });
    expect(onClose).not.toHaveBeenCalled();
  });
});
