import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import {
  UrlBarVisibilityProvider,
  useUrlBarVisibility,
} from "src/view/browser/hooks/use-url-bar-visibility";
import { describe, expect, it } from "vite-plus/test";

const VisibilityProbe: React.FC<{ paneId: string }> = ({ paneId }) => {
  const { isAnyExpanded, isExpanded, setExpanded } = useUrlBarVisibility(paneId);

  return (
    <div>
      <span data-testid={`${paneId}-any`}>{String(isAnyExpanded)}</span>
      <span data-testid={`${paneId}-self`}>{String(isExpanded)}</span>
      <button type="button" onClick={() => setExpanded(true)}>
        {paneId} を展開
      </button>
      <button type="button" onClick={() => setExpanded(false)}>
        {paneId} を折りたたむ
      </button>
    </div>
  );
};

describe("useUrlBarVisibility", () => {
  it("展開中のペインがある間だけ全体の表示状態を有効にする", () => {
    render(
      <UrlBarVisibilityProvider>
        <VisibilityProbe paneId="pane-1" />
        <VisibilityProbe paneId="pane-2" />
      </UrlBarVisibilityProvider>,
    );

    expect(screen.getByTestId("pane-1-any").textContent).toBe("false");
    expect(screen.getByTestId("pane-1-self").textContent).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "pane-1 を展開" }));

    expect(screen.getByTestId("pane-1-any").textContent).toBe("true");
    expect(screen.getByTestId("pane-1-self").textContent).toBe("true");
    expect(screen.getByTestId("pane-2-any").textContent).toBe("true");
    expect(screen.getByTestId("pane-2-self").textContent).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "pane-1 を折りたたむ" }));

    expect(screen.getByTestId("pane-1-any").textContent).toBe("false");
    expect(screen.getByTestId("pane-1-self").textContent).toBe("false");
  });
});
