import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ResBody } from "src/view/browser/components/ResBody";

const ANCHOR_HTML = '<a class="anchor">&gt;&gt;5</a>';

describe("ResBody anchor behavior", () => {
  it("rerender後も同じアンカーhoverで onAnchorHover を再発火しない", () => {
    const onAnchorHover = vi.fn();
    const rect: DOMRect = {
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 50,
      bottom: 30,
      width: 40,
      height: 10,
      toJSON: () => ({}),
    } as DOMRect;
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => rect);

    function Harness() {
      const [tick, setTick] = useState(0);

      return (
        <div data-testid={`tick-${tick}`}>
          <ResBody
            messageHtml={ANCHOR_HTML}
            anchorPreviewDepth={0}
            onUrlClick={() => {}}
            onUrlContextMenu={() => {}}
            onAnchorClick={() => {}}
            onAnchorHover={(targets, anchorRect, label, depth) => {
              onAnchorHover(targets, anchorRect, label, depth);
              // popup state更新のような親再描画が起きても、同一hover扱いで止まるべき。
              setTick((value) => value + 1);
            }}
            onAnchorLeave={() => {}}
          />
        </div>
      );
    }

    const { container } = render(<Harness />);

    const firstAnchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    fireEvent.mouseOver(firstAnchor);
    expect(onAnchorHover).toHaveBeenCalledTimes(1);

    const secondAnchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    fireEvent.mouseOver(secondAnchor);
    expect(onAnchorHover).toHaveBeenCalledTimes(1);

    getBoundingClientRectSpy.mockRestore();
  });

  it("アンカークリック時に先頭の参照先へジャンプする", () => {
    const onAnchorClick = vi.fn();
    const { container } = render(
      <ResBody
        messageHtml={ANCHOR_HTML}
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onAnchorClick={onAnchorClick}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    fireEvent.click(anchor);

    expect(onAnchorClick).toHaveBeenCalledOnce();
    expect(onAnchorClick).toHaveBeenCalledWith(5);
  });
});
