import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import type React from "react";
import { container } from "src/service-container";
import { PopupRenderer } from "src/view/browser/components/PopupRenderer";
import type { ContextMenuPopupItem, IdPopupItem } from "src/view/browser/hooks/popup-manager/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const popupResCardLifecycle = vi.hoisted(() => ({
  renderCounts: new Map<number, number>(),
}));

vi.mock("src/view/browser/components/PopupResCard", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    PopupResCard: React.memo(({ res }: { res: { num: number } }) => {
      popupResCardLifecycle.renderCounts.set(
        res.num,
        (popupResCardLifecycle.renderCounts.get(res.num) ?? 0) + 1,
      );
      return <div data-testid={`popup-res-card-${res.num}`}>{res.num}</div>;
    }),
  };
});

function createRes(num: number) {
  return {
    num,
    name: `name-${num}`,
    mail: "",
    date: "2026/05/11",
    message: `message-${num}`,
  };
}

describe("PopupRenderer", () => {
  beforeEach(() => {
    popupResCardLifecycle.renderCounts.clear();
    container.config = {
      get: vi.fn(() => "default"),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("popup内で子コンテキストメニューを開いても既存カードを再描画しない", () => {
    const host = document.createElement("div");
    host.className = "thread-page";
    document.body.appendChild(host);

    const idPopup: IdPopupItem = {
      id: "id-1",
      type: "id",
      x: 24,
      y: 16,
      z: 101,
      payload: {
        title: "ID:abc (1件)",
        items: [createRes(10)],
      },
    };
    const contextMenu: ContextMenuPopupItem = {
      id: "contextMenu-1",
      type: "contextMenu",
      x: 80,
      y: 40,
      z: 102,
      parentId: idPopup.id,
      payload: {
        items: [
          {
            id: "copy",
            label: "コピー",
          },
        ],
      },
    };

    const onPopupAnchorHover = (popupId: string) => {
      return (_targets: number[], _anchorRect: DOMRect, _label: string, _depth: number) => {
        void popupId;
      };
    };
    const onPopupIdLinkClick = (_parentId: string) => {
      return (_id: string, _event: React.MouseEvent) => {};
    };
    const onRepClickInPopup = (_parentId?: string, _anchorPreviewDepth?: number) => {
      return (_resNum: number, _event: React.MouseEvent) => {};
    };
    const onOpenRootReplyTreeInPopup = (_parentId?: string, _anchorPreviewDepth?: number) => {
      return (_resNum: number, _event: React.MouseEvent) => {};
    };
    const onResContextMenuOpen = (_parentId: string) => {
      return (_targetRes: ReturnType<typeof createRes>, _event: React.MouseEvent) => {};
    };
    const onUrlContextMenuOpen = (_parentId: string) => {
      return (_url: string, _event: React.MouseEvent, _mode?: string) => {};
    };

    const baseProps: React.ComponentProps<typeof PopupRenderer> = {
      host,
      anchorPreviews: [],
      idPopupItems: [idPopup],
      treePopupItems: [],
      contextMenuItems: [],
      messageProtocol: "https:",
      repIndex: new Map(),
      idIndex: new Map(),
      resMap: new Map([[10, createRes(10)]]),
      hasAnchorPreviews: false,
      hasPopupChild: () => false,
      isPopupDescendantOf: () => false,
      onAnchorClick: () => {},
      onAnchorHover: () => {},
      onPopupAnchorHover,
      onAnchorLeave: () => {},
      onClearAnchorPreviewHideTimer: () => {},
      onClosePopupById: () => {},
      onClosePopupChildren: () => {},
      onToggleTreePopupPinned: () => {},
      onToggleIdPopupPinned: () => {},
      onIdLinkClick: () => {},
      onPopupIdLinkClick,
      onRepClickInPopup,
      onOpenRootReplyTreeInPopup,
      onResContextMenuOpen,
      onUrlClick: () => false,
      onUrlContextMenuOpen,
    };

    const { rerender, unmount } = render(<PopupRenderer {...baseProps} />);

    expect(popupResCardLifecycle.renderCounts.get(10)).toBe(1);

    rerender(
      <PopupRenderer
        {...baseProps}
        contextMenuItems={[contextMenu]}
        hasPopupChild={(popupId) => popupId === idPopup.id}
      />,
    );

    expect(popupResCardLifecycle.renderCounts.get(10)).toBe(1);

    unmount();
    host.remove();
  });
});
