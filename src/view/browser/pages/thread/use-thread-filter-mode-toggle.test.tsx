import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { toggleThreadFilterMode } from "src/view/browser/extension/page-actions";
import { ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { useThreadFilterModeToggle } from "src/view/browser/pages/thread/use-thread-filter-mode-toggle";
import type { ThreadFilter } from "src/view/browser/types";
import { afterEach, describe, expect, it } from "vite-plus/test";

function Harness({ tabId, isActive = true }: { tabId: string; isActive?: boolean }) {
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [open, setOpen] = useState(false);
  useThreadFilterModeToggle({ tabId, isActive, setFilter, openFilterToolbar: () => setOpen(true) });
  return (
    <output data-testid={tabId}>
      {filter}:{String(open)}
    </output>
  );
}

describe("スレのフィルターモード操作", () => {
  afterEach(cleanup);

  it.each(["popular", "image", "video", "link"] as const)(
    "%s の選択と再選択で開閉と解除を維持する",
    (filter) => {
      render(<Harness tabId="one" />);
      act(() => {
        expect(toggleThreadFilterMode(window, "one", filter)).toBe("executed");
      });
      expect(screen.getByTestId("one")).toHaveTextContent(`${filter}:true`);
      act(() => {
        expect(toggleThreadFilterMode(window, "one", filter)).toBe("executed");
      });
      expect(screen.getByTestId("one")).toHaveTextContent("all:true");
    },
  );

  it("別ペインのスレには送らず、非表示や画面終了後は解除する", () => {
    const { rerender, unmount } = render(
      <>
        <Harness tabId="one" />
        <Harness tabId="two" />
      </>,
    );
    act(() => {
      expect(toggleThreadFilterMode(window, "two", "image")).toBe("executed");
    });
    expect(screen.getByTestId("one")).toHaveTextContent("all:false");
    expect(screen.getByTestId("two")).toHaveTextContent("image:true");
    rerender(
      <>
        <Harness tabId="one" />
        <Harness tabId="two" isActive={false} />
      </>,
    );
    expect(toggleThreadFilterMode(window, "two", "link")).toBe("target-unavailable");
    unmount();
    expect(toggleThreadFilterMode(window, "one", "link")).toBe("target-unavailable");
  });

  it("別窓への移動時は旧窓を解除し移動先だけに届ける", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const detachedWindow = iframe.contentWindow;
    if (!detachedWindow) throw new Error("テスト用の窓を作れませんでした");
    const { rerender, unmount } = render(
      <ViewSurfaceProvider surface={{ window, document }}>
        <Harness tabId="one" />
      </ViewSurfaceProvider>,
    );
    try {
      rerender(
        <ViewSurfaceProvider
          surface={{ window: detachedWindow, document: detachedWindow.document }}
        >
          <Harness tabId="one" />
        </ViewSurfaceProvider>,
      );
      expect(toggleThreadFilterMode(window, "one", "link")).toBe("target-unavailable");
      act(() => {
        expect(toggleThreadFilterMode(detachedWindow, "one", "link")).toBe("executed");
      });
      expect(screen.getByTestId("one")).toHaveTextContent("link:true");
      unmount();
      expect(toggleThreadFilterMode(detachedWindow, "one", "link")).toBe("target-unavailable");
    } finally {
      iframe.remove();
    }
  });
});
