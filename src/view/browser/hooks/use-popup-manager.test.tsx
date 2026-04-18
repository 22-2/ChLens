import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRes } from "src/service-container/interfaces";
import { AnchorPreview } from "src/view/browser/components/AnchorPreview";
import { ReplyTreePopup } from "src/view/browser/components/ReplyTreePopup";
import { usePopupManager } from "src/view/browser/hooks/use-popup-manager";
import type {
  AnchorPopupItem,
  PopupItem,
  TreePopupItem,
} from "src/view/browser/utils/types";

function createRes(num: number, message: string): IRes {
  return {
    num,
    name: `res-${num}`,
    mail: "",
    date: "2026/04/18(土) 12:00:00.000",
    message,
  };
}

const TEST_RES_MAP = new Map<number, IRes>([
  [2, createRes(2, "&gt;&gt;3")],
  [3, createRes(3, "preview target")],
  [4, createRes(4, "&gt;&gt;5")],
  [5, createRes(5, "nested preview target")],
]);

const TEST_REP_INDEX = new Map<number, Set<number>>([
  [1, new Set([2])],
  [3, new Set([4])],
]);

function summarizePopup(item: PopupItem): string {
  if (item.type === "tree") {
    return `tree:${item.payload.resNum}:depth=${item.payload.anchorPreviewDepth}`;
  }
  if (item.type === "anchor") {
    return `anchor:${item.payload.label}:depth=${item.payload.depth}:parent=${item.parentId ?? "root"}`;
  }
  return item.type;
}

function PopupSequenceHarness() {
  const { popups, addPopup, closePopupById, closePopupsByPredicate } =
    usePopupManager();

  const anchorPreviews = popups.filter(
    (item): item is AnchorPopupItem => item.type === "anchor",
  );
  const treePopups = popups.filter(
    (item): item is TreePopupItem => item.type === "tree",
  );

  const hideAnchorPreviewsFromDepth = (depth: number) => {
    closePopupsByPredicate(
      (item) => item.type === "anchor" && item.payload.depth >= depth,
    );
  };

  const addTreePopup = (
    resNum: number,
    parentId?: string,
    anchorPreviewDepth = 0,
  ) => {
    addPopup({
      type: "tree",
      x: 16,
      y: 16,
      // アンカープレビュー配下で開いた返信ツリーは、その深さを保持しないと
      // 次のアンカー表示時に親プレビューを root 扱いで消してしまう。
      payload: { resNum, anchorPreviewDepth },
      parentId,
    });
  };

  const showAnchorPreview = (
    targets: number[],
    _anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => {
    const items = targets
      .map((num) => TEST_RES_MAP.get(num))
      .filter((res): res is IRes => res != null);
    if (items.length === 0) {
      hideAnchorPreviewsFromDepth(depth);
      return;
    }

    const parentId = depth > 0 ? anchorPreviews[depth - 1]?.id : undefined;
    hideAnchorPreviewsFromDepth(depth);
    addPopup({
      type: "anchor",
      x: 32,
      y: 32,
      payload: { items, label, depth },
      parentId,
    });
  };

  const handleRepClickInPopup =
    (parentId?: string, anchorPreviewDepth = 0) =>
    (resNum: number, event: ReactMouseEvent) => {
      event.stopPropagation();
      addTreePopup(resNum, parentId, anchorPreviewDepth);
    };

  return (
    <div>
      <button onClick={() => addTreePopup(1)}>返信を開く</button>
      <output data-testid="popup-stack">
        {popups.map(summarizePopup).join(" | ")}
      </output>

      {anchorPreviews.map((anchorPreview) => (
        <AnchorPreview
          key={anchorPreview.id}
          depth={anchorPreview.payload.depth}
          x={anchorPreview.x}
          y={anchorPreview.y}
          items={anchorPreview.payload.items}
          label={anchorPreview.payload.label}
          messageProtocol="https:"
          repIndex={TEST_REP_INDEX}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onRepClick={handleRepClickInPopup(
            anchorPreview.id,
            anchorPreview.payload.depth + 1,
          )}
          onAnchorClick={() => {}}
          onAnchorHover={showAnchorPreview}
          onAnchorLeave={hideAnchorPreviewsFromDepth}
          onMouseEnter={() => {}}
          onMouseLeave={() => {}}
          buildContextMenuItems={() => []}
          zIndex={anchorPreview.z}
        />
      ))}

      {treePopups.map((treePopup, index) => (
        <ReplyTreePopup
          key={treePopup.id}
          x={treePopup.x}
          y={treePopup.y}
          resNum={treePopup.payload.resNum}
          repIndex={TEST_REP_INDEX}
          resMap={TEST_RES_MAP}
          messageProtocol="https:"
          anchorPreviewDepth={treePopup.payload.anchorPreviewDepth}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onRepClick={handleRepClickInPopup(
            treePopup.id,
            treePopup.payload.anchorPreviewDepth,
          )}
          onAnchorClick={() => {}}
          onAnchorHover={showAnchorPreview}
          onAnchorLeave={hideAnchorPreviewsFromDepth}
          buildContextMenuItems={() => []}
          disableOutsideClick={
            index < treePopups.length - 1 || anchorPreviews.length > 0
          }
          zIndex={treePopup.z}
          onClose={() => closePopupById(treePopup.id)}
        />
      ))}
    </div>
  );
}

describe("usePopupManager popup behavior", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("propagates inherited anchor depth into nested reply trees", () => {
    const onAnchorHover = vi.fn();

    render(
      <ReplyTreePopup
        x={16}
        y={16}
        resNum={3}
        repIndex={TEST_REP_INDEX}
        resMap={TEST_RES_MAP}
        messageProtocol="https:"
        anchorPreviewDepth={1}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onRepClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={onAnchorHover}
        onAnchorLeave={() => {}}
        buildContextMenuItems={() => []}
        onClose={() => {}}
      />,
    );

    fireEvent.mouseOver(screen.getByRole("link", { name: ">>5" }));

    expect(onAnchorHover).toHaveBeenCalled();
    expect(onAnchorHover.mock.lastCall?.[3]).toBe(1);
  });

  it("keeps parent popup chain when opening another anchor from a nested reply popup", () => {
    render(<PopupSequenceHarness />);

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));
    fireEvent.mouseOver(screen.getByRole("link", { name: ">>3" }));

    expect(screen.getByText("参照: >>3")).toBeInTheDocument();

    fireEvent.click(screen.getByText("返信(1)"));

    expect(screen.getByText(">>3 への返信ツリー")).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack")).toHaveTextContent(
      "tree:3:depth=1",
    );

    fireEvent.mouseOver(screen.getByRole("link", { name: ">>5" }));

    expect(screen.getByText("参照: >>3")).toBeInTheDocument();
    expect(screen.getByText(">>3 への返信ツリー")).toBeInTheDocument();
    expect(screen.getByText("参照: >>5")).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack")).toHaveTextContent(
      "anchor:>>5:depth=1",
    );
  });
});
