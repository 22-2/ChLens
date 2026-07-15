import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PopupPortalLayer } from "src/view/browser/components/PopupPortalLayer";
import { afterEach, describe, expect, it } from "vite-plus/test";

afterEach(() => {
  cleanup();
});

describe("PopupPortalLayer", () => {
  it("thread-page host 直下に portal layer を作って子要素を mount する", () => {
    const host = document.createElement("div");
    host.className = "thread-page";
    document.body.appendChild(host);

    const { unmount } = render(
      <PopupPortalLayer host={host}>
        <div>popup content</div>
      </PopupPortalLayer>,
    );

    const portalLayer = host.querySelector(".thread-page__popup-layer");
    expect(portalLayer).toBeInTheDocument();
    expect(portalLayer).toContainElement(screen.getByText("popup content"));

    unmount();

    expect(host.querySelector(".thread-page__popup-layer")).toBeNull();
    host.remove();
  });
});
