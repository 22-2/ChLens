import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { buildReplyIndexes } from "src/core/thread/reply-index";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
  IdPopupItem,
  PopupItem,
  TreePopupItem,
} from "src/features/popup/browser/popup-types";
import { usePopupCore } from "src/features/popup/browser/use-popup-manager";
import { AnchorPreview } from "src/features/popup/ui/AnchorPreview";
import { ReplyTreePopup } from "src/features/popup/ui/ReplyTreePopup";
import { ResPopup } from "src/features/popup/ui/ResPopup";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";
import {
  createRes,
  DUPLICATE_REPLY_INDEX,
  DUPLICATE_REPLY_RES_MAP,
  TEST_REP_INDEX,
  TEST_RES_MAP,
} from "src/test-support/popup-test-data";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ID_CHAIN_RES_MAP = new Map<number, IRes>([
  [10, createRes(10, "id root", "ID:AAA")],
  // ID経由で開くツリーも実際の返信を表示できるよう、本文に参照元を含める。
  [11, createRes(11, "&gt;&gt;10<br>id reply", "ID:AAA")],
]);

const ID_CHAIN_REP_INDEX = buildReplyIndexes(Array.from(ID_CHAIN_RES_MAP.values())).repIndex;

const ID_CHAIN_INDEX = new Map<string, Set<number>>([["ID:AAA", new Set([10, 11])]]);

function PinnedTreeHarness() {
  const { popups, addPopup, closeNonContextPopups, toggleTreePopupPinned } =
    usePopupCore("pinned-tree-test");
  const treePopup = popups.find((item): item is TreePopupItem => item.type === "tree");

  return (
    <div>
      <button
        onClick={() =>
          addPopup({
            type: "tree",
            x: 0,
            y: 0,
            payload: { resNum: 1, anchorPreviewDepth: 0, pinned: false },
          })
        }
      >
        ツリー追加
      </button>
      <button onClick={() => treePopup && toggleTreePopupPinned(treePopup.id)}>ピン切替</button>
      <button onClick={closeNonContextPopups}>通常popupを閉じる</button>
      <output data-testid="pinned-tree-state">
        {treePopup ? `${treePopup.id}:${treePopup.payload.pinned ? "pinned" : "normal"}` : "none"}
      </output>
    </div>
  );
}

function summarizePopup(item: PopupItem): string {
  if (item.type === "tree") {
    return `tree:${item.payload.resNum}:depth=${item.payload.anchorPreviewDepth}`;
  }
  if (item.type === "anchor") {
    return `anchor:${item.payload.label}:depth=${item.payload.depth}:parent=${
      item.parentId ?? "root"
    }`;
  }
  if (item.type === "contextMenu") {
    return `contextMenu:parent=${item.parentId ?? "root"}`;
  }
  return item.type;
}

function PopupSequenceHarness({
  resMap = TEST_RES_MAP,
  repIndex = TEST_REP_INDEX,
  rootResNum = 1,
}: {
  resMap?: Map<number, IRes>;
  repIndex?: Map<number, Set<number>>;
  rootResNum?: number;
}) {
  const {
    popups,
    addPopup,
    closePopupById,
    closePopupsByPredicate,
    closePopupChildren,
    isPopupDescendantOf,
  } = usePopupCore();

  const anchorPreviews = popups.filter((item): item is AnchorPopupItem => item.type === "anchor");
  const treePopups = popups.filter((item): item is TreePopupItem => item.type === "tree");
  const contextMenus = popups.filter(
    (item): item is ContextMenuPopupItem => item.type === "contextMenu",
  );

  const hasPopupChild = (popupId: string) => popups.some((item) => item.parentId === popupId);

  const hideAnchorPreviewsFromDepth = (depth: number) => {
    closePopupsByPredicate((item) => item.type === "anchor" && item.payload.depth >= depth);
  };

  const addTreePopup = (resNum: number, parentId?: string, anchorPreviewDepth = 0) => {
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
    sourcePopupId?: string,
  ) => {
    const items = targets.map((num) => resMap.get(num)).filter((res): res is IRes => res != null);
    if (items.length === 0) {
      hideAnchorPreviewsFromDepth(depth);
      return;
    }

    const parentId = depth > 0 ? anchorPreviews[depth - 1]?.id : sourcePopupId;
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

  const openContextMenu = (parentId?: string) => {
    closePopupsByPredicate((item) => item.type === "contextMenu");
    addPopup({
      type: "contextMenu",
      x: 48,
      y: 48,
      payload: {
        items: [{ id: "inspect", label: "Inspect" }],
      },
      parentId,
    });
  };

  return (
    <div>
      <button onClick={() => addTreePopup(rootResNum)}>返信を開く</button>
      <output data-testid="popup-stack">{popups.map(summarizePopup).join(" | ")}</output>
      <output data-testid="first-tree-id">{treePopups[0]?.id ?? ""}</output>
      <output data-testid="first-anchor-parent">{anchorPreviews[0]?.parentId ?? "root"}</output>

      {anchorPreviews.map((anchorPreview) => (
        <AnchorPreview
          key={anchorPreview.id}
          depth={anchorPreview.payload.depth}
          x={anchorPreview.x}
          y={anchorPreview.y}
          items={anchorPreview.payload.items}
          label={anchorPreview.payload.label}
          messageProtocol="https:"
          repIndex={repIndex}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onRepClick={handleRepClickInPopup(anchorPreview.id, anchorPreview.payload.depth + 1)}
          onOpenRootReplyTree={() => {}}
          onAnchorClick={() => {}}
          onAnchorHover={showAnchorPreview}
          onAnchorLeave={hideAnchorPreviewsFromDepth}
          onMouseEnter={() => {}}
          onMouseLeave={() => {}}
          popupId={anchorPreview.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => closePopupChildren(anchorPreview.id)}
          onPopupMouseDown={() => closePopupChildren(anchorPreview.id)}
          onResContextMenu={(_targetRes, event) => {
            event.preventDefault();
            event.stopPropagation();
            openContextMenu(anchorPreview.id);
          }}
          hasChildPopup={hasPopupChild(anchorPreview.id)}
          zIndex={anchorPreview.z}
        />
      ))}

      {treePopups.map((treePopup, index) => (
        <ReplyTreePopup
          key={treePopup.id}
          x={treePopup.x}
          y={treePopup.y}
          resNum={treePopup.payload.resNum}
          repIndex={repIndex}
          resMap={resMap}
          messageProtocol="https:"
          anchorPreviewDepth={treePopup.payload.anchorPreviewDepth}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onRepClick={handleRepClickInPopup(treePopup.id, treePopup.payload.anchorPreviewDepth)}
          onAnchorClick={() => {}}
          onAnchorHover={(targets, anchorRect, label, depth) =>
            showAnchorPreview(targets, anchorRect, label, depth, treePopup.id)
          }
          onAnchorLeave={hideAnchorPreviewsFromDepth}
          popupId={treePopup.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => closePopupChildren(treePopup.id)}
          onPopupMouseDown={() => closePopupChildren(treePopup.id)}
          onResContextMenu={(_targetRes, event) => {
            event.preventDefault();
            event.stopPropagation();
            openContextMenu(treePopup.id);
          }}
          disableOutsideClick={
            index < treePopups.length - 1 ||
            anchorPreviews.length > 0 ||
            hasPopupChild(treePopup.id)
          }
          zIndex={treePopup.z}
          onClose={() => closePopupById(treePopup.id)}
          onMouseEnter={() => {}}
        />
      ))}

      {contextMenus.map((menu) => (
        <ContextMenu
          key={menu.id}
          x={menu.x}
          y={menu.y}
          items={menu.payload.items}
          onClose={() => closePopupById(menu.id)}
          popupId={menu.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => closePopupChildren(menu.id)}
          onPopupMouseDown={() => closePopupChildren(menu.id)}
        />
      ))}
    </div>
  );
}

function PopupIdChainHarness() {
  const { popups, addPopup, closePopupById, closePopupChildren, isPopupDescendantOf } =
    usePopupCore();

  const treePopups = popups.filter((item): item is TreePopupItem => item.type === "tree");
  const idPopups = popups.filter((item): item is IdPopupItem => item.type === "id");

  const hasPopupChild = (popupId: string) => popups.some((item) => item.parentId === popupId);

  const addTreePopup = (resNum: number, parentId?: string) => {
    addPopup({
      type: "tree",
      x: 20,
      y: 20,
      payload: { resNum, anchorPreviewDepth: 0 },
      parentId,
    });
  };

  const addIdPopup = (
    clientX: number,
    clientY: number,
    items: IRes[],
    title: string,
    parentId?: string,
  ) => {
    addPopup({
      type: "id",
      x: clientX,
      y: clientY,
      payload: { items, title },
      parentId,
    });
  };

  const resolveIdItems = (id: string): IRes[] => {
    const ids = id.startsWith("ID:") ? [id, id.replace(/^ID:/i, "")] : [id, `ID:${id}`];
    const resolvedId = ids.find((candidate) => ID_CHAIN_INDEX.has(candidate));
    const resNums = resolvedId ? ID_CHAIN_INDEX.get(resolvedId) : undefined;
    if (!resNums) {
      return [];
    }

    return Array.from(resNums)
      .sort((a, b) => a - b)
      .map((num) => ID_CHAIN_RES_MAP.get(num))
      .filter((res): res is IRes => res != null);
  };

  const handleRepClickInPopup = (parentId: string) => (resNum: number, event: ReactMouseEvent) => {
    event.stopPropagation();
    addTreePopup(resNum, parentId);
  };

  const handlePopupIdClick = (parentId: string) => (id: string, event: ReactMouseEvent) => {
    event.stopPropagation();
    const items = resolveIdItems(id);
    if (items.length === 0) {
      return;
    }
    addIdPopup(40, 40, items, `${id} (${items.length}件)`, parentId);
  };

  return (
    <div>
      <button onClick={() => addTreePopup(10)}>ID親チェーンを開く</button>
      <output data-testid="popup-stack-id-chain">{popups.map(summarizePopup).join(" | ")}</output>

      {treePopups.map((treePopup, index) => (
        <ReplyTreePopup
          key={treePopup.id}
          x={treePopup.x}
          y={treePopup.y}
          resNum={treePopup.payload.resNum}
          repIndex={ID_CHAIN_REP_INDEX}
          idIndex={ID_CHAIN_INDEX}
          resMap={ID_CHAIN_RES_MAP}
          messageProtocol="https:"
          anchorPreviewDepth={0}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={handlePopupIdClick(treePopup.id)}
          onRepClick={handleRepClickInPopup(treePopup.id)}
          onAnchorClick={() => {}}
          onAnchorHover={() => {}}
          onAnchorLeave={() => {}}
          popupId={treePopup.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => closePopupChildren(treePopup.id)}
          onPopupMouseDown={() => closePopupChildren(treePopup.id)}
          onResContextMenu={() => {}}
          disableOutsideClick={index < treePopups.length - 1 || hasPopupChild(treePopup.id)}
          zIndex={treePopup.z}
          onClose={() => closePopupById(treePopup.id)}
          onMouseEnter={() => {}}
        />
      ))}

      {idPopups.map((item) => (
        <ResPopup
          key={item.id}
          x={item.x}
          y={item.y}
          title={item.payload.title}
          items={item.payload.items}
          messageProtocol="https:"
          repIndex={ID_CHAIN_REP_INDEX}
          idIndex={ID_CHAIN_INDEX}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={handlePopupIdClick(item.id)}
          onRepClick={handleRepClickInPopup(item.id)}
          onAnchorClick={() => {}}
          onAnchorHover={() => {}}
          onAnchorLeave={() => {}}
          popupId={item.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => closePopupChildren(item.id)}
          onPopupMouseDown={() => closePopupChildren(item.id)}
          onResContextMenu={() => {}}
          disableOutsideClick={hasPopupChild(item.id)}
          zIndex={item.z}
          onClose={() => closePopupById(item.id)}
          onMouseEnter={() => {}}
          onMouseLeave={() => {}}
        />
      ))}
    </div>
  );
}

describe("thread popup manager integration", () => {
  beforeEach(() => {
    // コピー後の通知まで実行されるため、テストでも通知サービスを登録する。
    container.toast = { notify: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() };
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
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("ピン留めした返信ツリーは通常popupの一括クローズ後も残る", () => {
    render(<PinnedTreeHarness />);

    fireEvent.click(screen.getByRole("button", { name: "ツリー追加" }));
    expect(screen.getByTestId("pinned-tree-state")).toHaveTextContent("normal");

    fireEvent.click(screen.getByRole("button", { name: "ピン切替" }));
    expect(screen.getByTestId("pinned-tree-state")).toHaveTextContent("pinned");

    fireEvent.click(screen.getByRole("button", { name: "通常popupを閉じる" }));
    expect(screen.getByTestId("pinned-tree-state")).toHaveTextContent("pinned");

    fireEvent.click(screen.getByRole("button", { name: "ピン切替" }));
    fireEvent.click(screen.getByRole("button", { name: "通常popupを閉じる" }));
    expect(screen.getByTestId("pinned-tree-state")).toHaveTextContent("none");
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
        onIdLinkClick={() => {}}
        onRepClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={onAnchorHover}
        onAnchorLeave={() => {}}
        onResContextMenu={() => {}}
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

    // 親ツリーの無効な返信リンクではなく、参照先プレビューから子ツリーを開く。
    const anchorPreview = document.querySelector(".anchor-preview") as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(2)"));

    expect(screen.getByText(">>3 への返信ツリー")).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack")).toHaveTextContent("tree:3:depth=1");

    fireEvent.mouseOver(screen.getByRole("link", { name: ">>5" }));

    expect(screen.getByText("参照: >>3")).toBeInTheDocument();
    expect(screen.getByText(">>3 への返信ツリー")).toBeInTheDocument();
    expect(screen.getByText("参照: >>5")).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack")).toHaveTextContent("anchor:>>5:depth=1");
  });

  it("anchors opened from a reply popup inherit that popup as parent", () => {
    render(<PopupSequenceHarness />);

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));
    fireEvent.mouseOver(screen.getByRole("link", { name: ">>3" }));

    expect(screen.getByTestId("first-anchor-parent").textContent).toBe(
      screen.getByTestId("first-tree-id").textContent,
    );
  });

  it("keeps ancestor popups when opening a context menu from a nested reply popup", () => {
    render(<PopupSequenceHarness />);

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));
    fireEvent.mouseOver(screen.getByRole("link", { name: ">>3" }));
    const anchorPreview = document.querySelector(".anchor-preview") as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(2)"));
    fireEvent.contextMenu(screen.getByText("4"));

    expect(screen.getByText("参照: >>3")).toBeInTheDocument();
    expect(screen.getByText(">>3 への返信ツリー")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack")).toHaveTextContent("anchor:>>3:depth=0");
    expect(screen.getByTestId("popup-stack")).toHaveTextContent("tree:3:depth=1");
    expect(screen.getByTestId("popup-stack")).toHaveTextContent("contextMenu:parent=");
  });

  it("keeps the exact duplicate reply chain alive when right-clicking the nested res", () => {
    render(
      <PopupSequenceHarness
        resMap={DUPLICATE_REPLY_RES_MAP}
        repIndex={DUPLICATE_REPLY_INDEX}
        rootResNum={3}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));

    const rootPopup = document.querySelectorAll(".res-popup")[0] as HTMLElement;
    fireEvent.mouseEnter(rootPopup);
    fireEvent.mouseOver(within(rootPopup).getByRole("link", { name: ">>3" }));

    const anchorPreview = document.querySelector(".anchor-preview") as HTMLElement;
    fireEvent.mouseEnter(anchorPreview);
    fireEvent.click(within(anchorPreview).getByText("返信(1)"));

    const popups = document.querySelectorAll(".res-popup");
    const nestedPopup = popups[1] as HTMLElement;
    fireEvent.mouseEnter(nestedPopup);
    fireEvent.mouseLeave(anchorPreview, { relatedTarget: nestedPopup });

    const nestedResNum = within(nestedPopup).getByText("6");
    fireEvent.contextMenu(nestedResNum);

    const menu = document.querySelector(".context-menu") as HTMLElement;
    fireEvent.mouseLeave(nestedPopup, { relatedTarget: menu });

    expect(document.querySelectorAll(".res-popup")).toHaveLength(2);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack").textContent).toContain("tree:3:depth=0");
    expect(screen.getByTestId("popup-stack").textContent).toContain("anchor:>>3:depth=0");
    expect(screen.getByTestId("popup-stack").textContent).toContain("tree:3:depth=1");
  });

  it("keeps ancestor popups when clicking a context menu item opened from a nested popup", () => {
    render(<PopupSequenceHarness />);

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));
    fireEvent.mouseOver(screen.getByRole("link", { name: ">>3" }));
    const anchorPreview = document.querySelector(".anchor-preview") as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(2)"));
    fireEvent.contextMenu(screen.getByText("4"));

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    });

    expect(screen.queryByRole("button", { name: "Inspect" })).not.toBeInTheDocument();
    expect(screen.getByText("参照: >>3")).toBeInTheDocument();
    expect(screen.getByText(">>3 への返信ツリー")).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack").textContent).not.toContain("contextMenu");
    expect(screen.getByTestId("popup-stack").textContent).toContain("tree:3:depth=1");
  });

  it("moving from a child reply popup back to its parent closes the entire descendant branch", () => {
    render(
      <PopupSequenceHarness
        resMap={DUPLICATE_REPLY_RES_MAP}
        repIndex={DUPLICATE_REPLY_INDEX}
        rootResNum={3}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));

    const rootPopup = document.querySelectorAll(".res-popup")[0] as HTMLElement;
    fireEvent.mouseOver(within(rootPopup).getByRole("link", { name: ">>3" }));

    const anchorPreview = document.querySelector(".anchor-preview") as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(1)"));

    const nestedPopup = document.querySelectorAll(".res-popup")[1] as HTMLElement;
    fireEvent.mouseEnter(rootPopup, { relatedTarget: nestedPopup });
    fireEvent.mouseLeave(nestedPopup, { relatedTarget: rootPopup });

    expect(document.querySelectorAll(".res-popup")).toHaveLength(1);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(0);
    expect(screen.getByTestId("popup-stack").textContent).toBe("tree:3:depth=0");
  });

  it("context menu does not close on mouseleave and closes on outside click", () => {
    const onClose = vi.fn();
    render(
      <>
        <div data-popup="true" data-popup-id="tree-1">
          parent popup
        </div>
        <ContextMenu
          x={0}
          y={0}
          items={[{ id: "inspect", label: "Inspect" }]}
          onClose={onClose}
          popupId="contextMenu-1"
        />
      </>,
    );

    const menu = document.querySelector(".context-menu") as HTMLElement;
    const parentPopup = screen.getByText("parent popup");
    fireEvent.mouseLeave(menu, { relatedTarget: parentPopup });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("while a child context menu is open, ancestor popups do not close on mouseleave", () => {
    render(
      <PopupSequenceHarness
        resMap={DUPLICATE_REPLY_RES_MAP}
        repIndex={DUPLICATE_REPLY_INDEX}
        rootResNum={3}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));

    const rootPopup = document.querySelectorAll(".res-popup")[0] as HTMLElement;
    fireEvent.mouseOver(within(rootPopup).getByRole("link", { name: ">>3" }));

    const anchorPreview = document.querySelector(".anchor-preview") as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(1)"));

    const nestedPopup = document.querySelectorAll(".res-popup")[1] as HTMLElement;
    fireEvent.contextMenu(within(nestedPopup).getByText("6"));

    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();

    fireEvent.mouseLeave(nestedPopup, { relatedTarget: null });
    fireEvent.mouseLeave(anchorPreview, { relatedTarget: null });
    fireEvent.mouseLeave(rootPopup, { relatedTarget: null });

    expect(document.querySelectorAll(".res-popup")).toHaveLength(2);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();
  });

  it("moving from child context menu to ancestor popup keeps the menu open", () => {
    render(
      <PopupSequenceHarness
        resMap={DUPLICATE_REPLY_RES_MAP}
        repIndex={DUPLICATE_REPLY_INDEX}
        rootResNum={3}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));

    const rootPopup = document.querySelectorAll(".res-popup")[0] as HTMLElement;
    fireEvent.mouseOver(within(rootPopup).getByRole("link", { name: ">>3" }));

    const anchorPreview = document.querySelector(".anchor-preview") as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(1)"));

    const nestedPopup = document.querySelectorAll(".res-popup")[1] as HTMLElement;
    fireEvent.contextMenu(within(nestedPopup).getByText("6"));

    const menu = document.querySelector(".context-menu") as HTMLElement;
    expect(menu).toBeInTheDocument();

    fireEvent.mouseEnter(nestedPopup, { relatedTarget: menu });
    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();

    fireEvent.mouseEnter(rootPopup, { relatedTarget: menu });
    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();
  });

  it("context menu configured for outside-click close does not auto-close when child menu closes", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ id: "inspect", label: "Inspect" }]}
        onClose={onClose}
        popupId="contextMenu-parent"
        closeDisabled={true}
      />,
    );

    const menu = document.querySelector(".context-menu") as HTMLElement;
    fireEvent.mouseLeave(menu, { relatedTarget: null });
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <ContextMenu
        x={0}
        y={0}
        items={[{ id: "inspect", label: "Inspect" }]}
        onClose={onClose}
        popupId="contextMenu-parent"
        closeDisabled={false}
      />,
    );

    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clicking the root popup closes all descendant popups in that branch", () => {
    render(
      <PopupSequenceHarness
        resMap={DUPLICATE_REPLY_RES_MAP}
        repIndex={DUPLICATE_REPLY_INDEX}
        rootResNum={3}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));

    const rootPopup = document.querySelectorAll(".res-popup")[0] as HTMLElement;
    fireEvent.mouseOver(within(rootPopup).getByRole("link", { name: ">>3" }));

    const anchorPreview = document.querySelector(".anchor-preview") as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(1)"));

    expect(document.querySelectorAll(".res-popup")).toHaveLength(2);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(1);

    fireEvent.mouseDown(rootPopup);

    expect(document.querySelectorAll(".res-popup")).toHaveLength(1);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(0);
    expect(screen.getByTestId("popup-stack").textContent).toBe("tree:3:depth=0");
  });

  it("clicking a link inside the popup does not collapse existing child popups", () => {
    render(<PopupSequenceHarness />);

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));

    const rootPopup = document.querySelectorAll(".res-popup")[0] as HTMLElement;
    const anchorLink = within(rootPopup).getByRole("link", { name: ">>3" });

    fireEvent.mouseOver(anchorLink);
    expect(screen.getByText("参照: >>3")).toBeInTheDocument();

    fireEvent.mouseDown(anchorLink, { button: 0 });
    fireEvent.click(anchorLink);

    expect(screen.getByText("参照: >>3")).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack").textContent).toContain("anchor:>>3:depth=0");
  });

  it("right-clicking the root popup closes descendants before opening its menu", () => {
    render(
      <PopupSequenceHarness
        resMap={DUPLICATE_REPLY_RES_MAP}
        repIndex={DUPLICATE_REPLY_INDEX}
        rootResNum={3}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "返信を開く" }));

    const rootPopup = document.querySelectorAll(".res-popup")[0] as HTMLElement;
    fireEvent.mouseOver(within(rootPopup).getByRole("link", { name: ">>3" }));

    const anchorPreview = document.querySelector(".anchor-preview") as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(1)"));

    const rootResNum = within(rootPopup).getByText("6");
    fireEvent.mouseDown(rootResNum, { button: 2 });
    fireEvent.contextMenu(rootResNum);

    expect(document.querySelectorAll(".res-popup")).toHaveLength(1);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack").textContent).toContain("contextMenu:parent=tree-1");
  });

  it("opening ID popup from inside popup does not close ancestor popup chain", () => {
    render(<PopupIdChainHarness />);

    fireEvent.click(screen.getByRole("button", { name: "ID親チェーンを開く" }));
    expect(screen.getAllByText(">>10 への返信ツリー")).toHaveLength(1);

    const firstTreePopup = document.querySelectorAll(".res-popup")[0] as HTMLElement;
    fireEvent.click(within(firstTreePopup).getAllByText("ID:AAA(2)")[0]);

    expect(document.querySelectorAll(".res-popup")).toHaveLength(2);
    expect(screen.getByText(">>10 への返信ツリー")).toBeInTheDocument();

    const firstIdPopup = document.querySelectorAll(".res-popup")[1] as HTMLElement;
    fireEvent.click(within(firstIdPopup).getByText("返信(1)"));

    const nestedTreePopup = document.querySelectorAll(".res-popup")[2] as HTMLElement;
    fireEvent.click(within(nestedTreePopup).getAllByText("ID:AAA(2)")[0]);

    // ID popup配下の返信popupからさらにID popupを開いても、既存の祖先枝は残ること。
    expect(document.querySelectorAll(".res-popup")).toHaveLength(4);
    expect(screen.getAllByText(">>10 への返信ツリー")).toHaveLength(2);
    expect(screen.getAllByText("ID:AAA (2件)")).toHaveLength(2);
    expect(screen.getByTestId("popup-stack-id-chain").textContent).toContain("tree:10:depth=0");
    expect(screen.getByTestId("popup-stack-id-chain").textContent).toContain("id");
    expect(screen.getByTestId("popup-stack-id-chain").textContent).toContain(
      "tree:10:depth=0 | id | tree:10:depth=0 | id",
    );
  });

  it("ID popup配下のレスツリーをコピーしても祖先popupを閉じない", () => {
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<PopupIdChainHarness />);

    fireEvent.click(screen.getByRole("button", { name: "ID親チェーンを開く" }));

    const firstTreePopup = document.querySelectorAll(".res-popup")[0] as HTMLElement;
    fireEvent.click(within(firstTreePopup).getAllByText("ID:AAA(2)")[0]);

    const firstIdPopup = document.querySelectorAll(".res-popup")[1] as HTMLElement;
    fireEvent.click(within(firstIdPopup).getByText("返信(1)"));

    const nestedTreePopup = Array.from(
      document.querySelectorAll<HTMLElement>('.res-popup[data-popup-id^="tree-"]'),
    ).at(-1);
    if (!nestedTreePopup) {
      throw new Error("返信ツリーポップアップが見つかりません");
    }
    fireEvent.click(within(nestedTreePopup).getByRole("button", { name: "返信ツリーメニュー" }));

    const copyButton = within(nestedTreePopup).getByRole("button", {
      name: "返信ツリーを一括コピー",
    });
    fireEvent.mouseDown(copyButton);

    // メニュー項目の mousedown は、IDポップアップから見ても外側クリックではない。
    expect(document.querySelectorAll(".res-popup")).toHaveLength(3);

    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledOnce();
    expect(document.querySelectorAll(".res-popup")).toHaveLength(3);
    expect(
      within(nestedTreePopup).queryByRole("button", { name: "返信ツリーを一括コピー" }),
    ).not.toBeInTheDocument();

    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

// 画像取得の依存から拡張 API を初期化しないよう、画面テストでは通信境界を差し替える。
vi.mock("src/app/platform", () => ({ platform: { http: { fetch: vi.fn() } } }));
