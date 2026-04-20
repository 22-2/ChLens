import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePopupSurfaceCloseGuard } from "src/view/browser/hooks/use-popup-manager";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function PopupCloseGuardHarness({ onClose }: { onClose: () => void }) {
  const { armMouseLeaveCloseSuppression, shouldSuppressMouseLeaveClose } =
    usePopupSurfaceCloseGuard();

  return (
    <div
      data-testid="surface"
      onMouseLeave={() => {
        if (shouldSuppressMouseLeaveClose()) {
          return;
        }
        onClose();
      }}
    >
      <button type="button" onClick={armMouseLeaveCloseSuppression}>
        arm guard
      </button>
    </div>
  );
}

describe("usePopupSurfaceCloseGuard", () => {
  it("middle click 直後の mouseleave close を抑止する", () => {
    const onClose = vi.fn();

    render(<PopupCloseGuardHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "arm guard" }));
    fireEvent.mouseLeave(screen.getByTestId("surface"), {
      relatedTarget: null,
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("middle click 後は遅延した最初の mouseleave も1回は抑止する", () => {
    const onClose = vi.fn();

    vi.useFakeTimers();
    render(<PopupCloseGuardHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "arm guard" }));
    vi.advanceTimersByTime(1000);
    fireEvent.mouseLeave(screen.getByTestId("surface"), {
      relatedTarget: null,
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
