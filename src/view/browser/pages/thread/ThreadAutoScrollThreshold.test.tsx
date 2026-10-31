import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { ThreadAutoScrollThreshold } from "src/view/browser/pages/thread/ThreadAutoScrollThreshold";
import { afterEach, describe, expect, it } from "vite-plus/test";

describe("ThreadAutoScrollThreshold", () => {
  afterEach(() => {
    cleanup();
  });

  it("追従できる位置では、新着に追従する旨を表示し、判定線を有効な状態にする", () => {
    const { container } = render(
      <ThreadAutoScrollThreshold
        canAutoScroll
        isAutoScrolling={false}
        boundaryRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.getByText("この線より下なので新着に追従します")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("thread-page__auto-scroll-threshold--armed");
  });

  it("追従できない位置では、線より下にいる時だけ追従する旨を表示する", () => {
    const { container } = render(
      <ThreadAutoScrollThreshold
        canAutoScroll={false}
        isAutoScrolling={false}
        boundaryRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.getByText("この線より下にいる時だけ新着に追従します")).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass(
      "thread-page__auto-scroll-threshold--armed",
    );
  });

  it("自動スクロール中は、スクロール中の表示を付ける", () => {
    const { container } = render(
      <ThreadAutoScrollThreshold
        canAutoScroll
        isAutoScrolling
        boundaryRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(container.firstElementChild).toHaveClass(
      "thread-page__auto-scroll-threshold--scrolling",
    );
  });

  it("判定線の要素を boundaryRef に渡し、支援技術からは隠す", () => {
    const boundaryRef = createRef<HTMLDivElement>();
    const { container } = render(
      <ThreadAutoScrollThreshold canAutoScroll isAutoScrolling={false} boundaryRef={boundaryRef} />,
    );

    const line = container.querySelector(".thread-page__auto-scroll-threshold-line");
    expect(boundaryRef.current).toBe(line);
    expect(line).toHaveAttribute("aria-hidden", "true");
  });
});
