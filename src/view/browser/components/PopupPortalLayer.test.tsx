import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PopupPortalLayer } from "src/view/browser/components/PopupPortalLayer";

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
