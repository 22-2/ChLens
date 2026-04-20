import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { IRes } from "src/service-container/interfaces";
import { AnchorPreview } from "src/view/browser/components/AnchorPreview";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { ReplyTreePopup } from "src/view/browser/components/ReplyTreePopup";
import { ResPopup } from "src/view/browser/components/ResPopup";
import { usePopupManager } from "src/view/browser/hooks/use-popup-manager";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
  IdPopupItem,
  PopupItem,
  TreePopupItem,
} from "src/view/browser/utils/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createRes(num: number, message: string, id?: string): IRes {
  return {
    num,
    name: `res-${num}`,
    mail: "",
    date: "2026/04/18(土) 12:00:00.000",
    message,
    id,
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

const DUPLICATE_REPLY_RES_MAP = new Map<number, IRes>([
  [3, createRes(3, "preview target")],
  [6, createRes(6, "&gt;&gt;3")],
]);

const DUPLICATE_REPLY_INDEX = new Map<number, Set<number>>([[3, new Set([6])]]);

const ID_CHAIN_RES_MAP = new Map<number, IRes>([
  [10, createRes(10, "id root", "ID:AAA")],
  [11, createRes(11, "id reply", "ID:AAA")],
]);

const ID_CHAIN_REP_INDEX = new Map<number, Set<number>>([[10, new Set([11])]]);

const ID_CHAIN_INDEX = new Map<string, Set<number>>([
  ["ID:AAA", new Set([10, 11])],
]);

function summarizePopup(item: PopupItem): string {
  if (item.type === "tree") {
    return `tree:${item.payload.resNum}:depth=${item.payload.anchorPreviewDepth}`;
  }
  if (item.type === "anchor") {
    return `anchor:${item.payload.label}:depth=${item.payload.depth}:parent=${item.parentId ?? "root"}`;
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
  } = usePopupManager();

  const anchorPreviews = popups.filter(
    (item): item is AnchorPopupItem => item.type === "anchor",
  );
  const treePopups = popups.filter(
    (item): item is TreePopupItem => item.type === "tree",
  );
  const contextMenus = popups.filter(
    (item): item is ContextMenuPopupItem => item.type === "contextMenu",
  );

  const hasPopupChild = (popupId: string) =>
    popups.some((item) => item.parentId === popupId);

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
    sourcePopupId?: string,
  ) => {
    const items = targets
      .map((num) => resMap.get(num))
      .filter((res): res is IRes => res != null);
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
      <output data-testid="popup-stack">
        {popups.map(summarizePopup).join(" | ")}
      </output>
      <output data-testid="first-tree-id">{treePopups[0]?.id ?? ""}</output>
      <output data-testid="first-anchor-parent">
        {anchorPreviews[0]?.parentId ?? "root"}
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
          repIndex={repIndex}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onRepClick={handleRepClickInPopup(
            anchorPreview.id,
            anchorPreview.payload.depth + 1,
          )}
          onAnchorClick={() => {}}
          onAnchorHover={showAnchorPreview}
          onAnchorLeave={hideAnchorPreviewsFromDepth}
          onMouseEnter={() => {}}
          onMouseLeave={() => {}}
          popupId={anchorPreview.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => closePopupChildren(anchorPreview.id)}
          onSurfaceMouseDown={() => closePopupChildren(anchorPreview.id)}
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
          onRepClick={handleRepClickInPopup(
            treePopup.id,
            treePopup.payload.anchorPreviewDepth,
          )}
          onAnchorClick={() => {}}
          onAnchorHover={(targets, anchorRect, label, depth) =>
            showAnchorPreview(targets, anchorRect, label, depth, treePopup.id)
          }
          onAnchorLeave={hideAnchorPreviewsFromDepth}
          popupId={treePopup.id}
          isPopupDescendantOf={isPopupDescendantOf}
          onEnterFromDescendant={() => closePopupChildren(treePopup.id)}
          onSurfaceMouseDown={() => closePopupChildren(treePopup.id)}
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
          onSurfaceMouseDown={() => closePopupChildren(menu.id)}
        />
      ))}
    </div>
  );
}

function PopupIdChainHarness() {
  const {
    popups,
    addPopup,
    closePopupById,
    closePopupChildren,
    isPopupDescendantOf,
  } = usePopupManager();

  const treePopups = popups.filter(
    (item): item is TreePopupItem => item.type === "tree",
  );
  const idPopups = popups.filter(
    (item): item is IdPopupItem => item.type === "id",
  );

  const hasPopupChild = (popupId: string) =>
    popups.some((item) => item.parentId === popupId);

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

  const handleRepClickInPopup =
    (parentId: string) => (resNum: number, event: ReactMouseEvent) => {
      event.stopPropagation();
      addTreePopup(resNum, parentId);
    };

  const handlePopupIdClick =
    (parentId: string) => (id: string, event: ReactMouseEvent) => {
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
      <output data-testid="popup-stack-id-chain">
        {popups.map(summarizePopup).join(" | ")}
      </output>

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
          onSurfaceMouseDown={() => closePopupChildren(treePopup.id)}
          onResContextMenu={() => {}}
          disableOutsideClick={
            index < treePopups.length - 1 || hasPopupChild(treePopup.id)
          }
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
          onSurfaceMouseDown={() => closePopupChildren(item.id)}
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
    fireEvent.click(screen.getByText("返信(1)"));
    fireEvent.contextMenu(screen.getByText("4"));

    expect(screen.getByText("参照: >>3")).toBeInTheDocument();
    expect(screen.getByText(">>3 への返信ツリー")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack")).toHaveTextContent(
      "anchor:>>3:depth=0",
    );
    expect(screen.getByTestId("popup-stack")).toHaveTextContent(
      "tree:3:depth=1",
    );
    expect(screen.getByTestId("popup-stack")).toHaveTextContent(
      "contextMenu:parent=",
    );
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

    const anchorPreview = document.querySelector(
      ".anchor-preview",
    ) as HTMLElement;
    fireEvent.mouseEnter(anchorPreview);
    fireEvent.click(within(anchorPreview).getByText("返信(1)"));

    const popupSurfaces = document.querySelectorAll(".res-popup");
    const nestedPopup = popupSurfaces[1] as HTMLElement;
    fireEvent.mouseEnter(nestedPopup);
    fireEvent.mouseLeave(anchorPreview, { relatedTarget: nestedPopup });

    const nestedResNum = within(nestedPopup).getByText("6");
    fireEvent.contextMenu(nestedResNum);

    const menu = document.querySelector(".context-menu") as HTMLElement;
    fireEvent.mouseLeave(nestedPopup, { relatedTarget: menu });

    expect(document.querySelectorAll(".res-popup")).toHaveLength(2);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack").textContent).toContain(
      "tree:3:depth=0",
    );
    expect(screen.getByTestId("popup-stack").textContent).toContain(
      "anchor:>>3:depth=0",
    );
    expect(screen.getByTestId("popup-stack").textContent).toContain(
      "tree:3:depth=1",
    );
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

    const anchorPreview = document.querySelector(
      ".anchor-preview",
    ) as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(1)"));

    const nestedPopup = document.querySelectorAll(".res-popup")[1] as HTMLElement;
    fireEvent.mouseEnter(rootPopup, { relatedTarget: nestedPopup });
    fireEvent.mouseLeave(nestedPopup, { relatedTarget: rootPopup });

    expect(document.querySelectorAll(".res-popup")).toHaveLength(1);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(0);
    expect(screen.getByTestId("popup-stack").textContent).toBe(
      "tree:3:depth=0",
    );
  });

  it("moving from a context menu back to its parent surface closes the menu", () => {
    const onClose = vi.fn();
    render(
      <>
        <div data-popup-surface="true" data-popup-id="tree-1">
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
    const parentSurface = screen.getByText("parent popup");
    fireEvent.mouseLeave(menu, { relatedTarget: parentSurface });

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

    const anchorPreview = document.querySelector(
      ".anchor-preview",
    ) as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(1)"));

    expect(document.querySelectorAll(".res-popup")).toHaveLength(2);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(1);

    fireEvent.mouseDown(rootPopup);

    expect(document.querySelectorAll(".res-popup")).toHaveLength(1);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(0);
    expect(screen.getByTestId("popup-stack").textContent).toBe(
      "tree:3:depth=0",
    );
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
    expect(screen.getByTestId("popup-stack").textContent).toContain(
      "anchor:>>3:depth=0",
    );
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

    const anchorPreview = document.querySelector(
      ".anchor-preview",
    ) as HTMLElement;
    fireEvent.click(within(anchorPreview).getByText("返信(1)"));

    const rootResNum = within(rootPopup).getByText("6");
    fireEvent.mouseDown(rootResNum, { button: 2 });
    fireEvent.contextMenu(rootResNum);

    expect(document.querySelectorAll(".res-popup")).toHaveLength(1);
    expect(document.querySelectorAll(".anchor-preview")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();
    expect(screen.getByTestId("popup-stack").textContent).toContain(
      "contextMenu:parent=tree-1",
    );
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
    expect(screen.getByTestId("popup-stack-id-chain").textContent).toContain(
      "tree:10:depth=0",
    );
    expect(screen.getByTestId("popup-stack-id-chain").textContent).toContain(
      "id",
    );
    expect(screen.getByTestId("popup-stack-id-chain").textContent).toContain(
      "tree:10:depth=0 | id | tree:10:depth=0 | id",
    );
  });
});

// --- ReplyTreePopup: disableOutsideClick 遷移時の自動 close / outside click ---

const TREE_BASE_PROPS = {
  x: 0,
  y: 0,
  resNum: 1,
  repIndex: TEST_REP_INDEX,
  resMap: TEST_RES_MAP,
  messageProtocol: "https:" as const,
  anchorPreviewDepth: 0,
  onUrlClick: () => {},
  onUrlContextMenu: () => {},
  onIdLinkClick: () => {},
  onRepClick: () => {},
  onAnchorClick: () => {},
  onAnchorHover: () => {},
  onAnchorLeave: () => {},
  onResContextMenu: () => {},
} as const;

const ANCHOR_BASE_PROPS = {
  depth: 0,
  x: 0,
  y: 0,
  items: [createRes(9, "anchor preview")] as IRes[],
  label: ">>9",
  messageProtocol: "https:" as const,
  repIndex: TEST_REP_INDEX,
  onUrlClick: () => {},
  onUrlContextMenu: () => {},
  onIdLinkClick: () => {},
  onRepClick: () => {},
  onAnchorClick: () => {},
  onAnchorHover: () => {},
  onAnchorLeave: () => {},
  onMouseEnter: () => {},
  onMouseLeave: () => {},
  onResContextMenu: () => {},
  zIndex: 10020,
} as const;

const RES_BASE_PROPS = {
  x: 0,
  y: 0,
  title: "ID:abc",
  items: [createRes(6, "&gt;&gt;3")] as IRes[],
  messageProtocol: "https:" as const,
  repIndex: DUPLICATE_REPLY_INDEX,
  onUrlClick: () => {},
  onUrlContextMenu: () => {},
  onIdLinkClick: () => {},
  onRepClick: () => {},
  onAnchorClick: () => {},
  onAnchorHover: () => {},
  onAnchorLeave: () => {},
  onResContextMenu: () => {},
  zIndex: 10020,
} as const;

describe("ReplyTreePopup close behavior", () => {
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

  it("[bug再現] disableOutsideClick が true→false に変わり、かつカーソルが外にあれば自動 close する", () => {
    // 子ポップアップ(anchor/tree)が閉じて disableOutsideClick が false に変わった瞬間、
    // mouseleave は既に無視済みなので自動 close で補完しなければ tree1 が残ったままになる。
    const onClose = vi.fn();
    const { rerender } = render(
      <ReplyTreePopup
        {...TREE_BASE_PROPS}
        disableOutsideClick={true}
        onClose={onClose}
      />,
    );

    // cursor はポップアップに入っていない（isHovering=false）
    expect(onClose).not.toHaveBeenCalled();

    // 子ポップアップが閉じて disableOutsideClick が false に変わる
    rerender(
      <ReplyTreePopup
        {...TREE_BASE_PROPS}
        disableOutsideClick={false}
        onClose={onClose}
      />,
    );

    // カーソルが外にいるので自動 close されるべき
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disableOutsideClick が true→false に変わってもカーソルが内部にあれば close しない", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ReplyTreePopup
        {...TREE_BASE_PROPS}
        disableOutsideClick={true}
        onClose={onClose}
      />,
    );

    // カーソルがポップアップ内に入る
    const popup = document.querySelector(".res-popup") as HTMLElement;
    fireEvent.mouseEnter(popup);

    // 子が閉じて disableOutsideClick が false に変わる
    rerender(
      <ReplyTreePopup
        {...TREE_BASE_PROPS}
        disableOutsideClick={false}
        onClose={onClose}
      />,
    );

    // カーソルが内部にあるので close してはいけない
    expect(onClose).not.toHaveBeenCalled();

    // その後カーソルが出ると mouseleave で close される
    act(() => {
      fireEvent.mouseLeave(popup);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("子がいない状態（disableOutsideClick=false）で外側 mousedown すると close する", () => {
    const onClose = vi.fn();
    render(
      <ReplyTreePopup
        {...TREE_BASE_PROPS}
        disableOutsideClick={false}
        onClose={onClose}
      />,
    );

    // ポップアップ外の領域をクリック
    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("子がいる状態（disableOutsideClick=true）では外側 mousedown しても close しない", () => {
    const onClose = vi.fn();
    render(
      <ReplyTreePopup
        {...TREE_BASE_PROPS}
        disableOutsideClick={true}
        onClose={onClose}
      />,
    );

    fireEvent.mouseDown(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("兄弟のpopup surfaceへマウス移動しても close しない", () => {
    const onClose = vi.fn();
    render(
      <>
        <ReplyTreePopup
          {...TREE_BASE_PROPS}
          disableOutsideClick={false}
          onClose={onClose}
        />
        <div data-popup-surface="true">menu</div>
      </>,
    );

    const popup = document.querySelector(".res-popup") as HTMLElement;
    const siblingSurface = screen.getByText("menu");

    act(() => {
      fireEvent.mouseLeave(popup, { relatedTarget: siblingSurface });
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("兄弟のpopup surfaceへマウス移動しても onMouseLeave callback を流さない", () => {
    const onMouseLeave = vi.fn();
    render(
      <>
        <ReplyTreePopup
          {...TREE_BASE_PROPS}
          disableOutsideClick={false}
          onClose={() => {}}
          onMouseLeave={onMouseLeave}
        />
        <div data-popup-surface="true">menu</div>
      </>,
    );

    const popup = document.querySelector(".res-popup") as HTMLElement;
    const siblingSurface = screen.getByText("menu");

    act(() => {
      fireEvent.mouseLeave(popup, { relatedTarget: siblingSurface });
    });

    expect(onMouseLeave).not.toHaveBeenCalled();
  });

  it("親ポップアップを閉じると子コンテキストメニューも一緒に閉じる", () => {
    function PopupTreeHarness() {
      const { popups, addPopup, closePopupById } = usePopupManager();

      return (
        <div>
          <button
            onClick={() => {
              const treeId = addPopup({
                type: "tree",
                x: 8,
                y: 8,
                payload: { resNum: 1, anchorPreviewDepth: 0 },
              });
              addPopup({
                type: "contextMenu",
                x: 16,
                y: 16,
                payload: { items: [] },
                parentId: treeId,
              });
            }}
          >
            開く
          </button>
          <button
            onClick={() => {
              const treePopup = popups.find(
                (item): item is TreePopupItem => item.type === "tree",
              );
              if (!treePopup) return;
              closePopupById(treePopup.id);
            }}
          >
            閉じる
          </button>
          <output data-testid="popup-tree-types">
            {popups.map((item) => item.type).join("|")}
          </output>
        </div>
      );
    }

    render(<PopupTreeHarness />);

    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    expect(screen.getByTestId("popup-tree-types")).toHaveTextContent(
      "tree|contextMenu",
    );

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.getByTestId("popup-tree-types")).toBeEmptyDOMElement();
  });
});

describe("AnchorPreview child popup behavior", () => {
  afterEach(() => {
    cleanup();
  });

  it("子メニューが閉じた時にカーソルが外なら遅延 close を再開する", () => {
    const onMouseLeave = vi.fn();
    const { rerender } = render(
      <AnchorPreview
        {...ANCHOR_BASE_PROPS}
        hasChildPopup={true}
        onMouseLeave={onMouseLeave}
      />,
    );

    expect(onMouseLeave).not.toHaveBeenCalled();

    rerender(
      <AnchorPreview
        {...ANCHOR_BASE_PROPS}
        hasChildPopup={false}
        onMouseLeave={onMouseLeave}
      />,
    );

    expect(onMouseLeave).toHaveBeenCalledOnce();
  });

  it("[bug再現] 子プレビューが閉じた時に実際のホバー状態が外なら親プレビューも閉じる", () => {
    const onMouseLeave = vi.fn();
    const { rerender } = render(
      <AnchorPreview
        {...ANCHOR_BASE_PROPS}
        hasChildPopup={true}
        onMouseLeave={onMouseLeave}
      />,
    );

    const preview = document.querySelector(".anchor-preview") as HTMLElement;
    fireEvent.mouseEnter(preview);

    const originalMatches = preview.matches.bind(preview);
    Object.defineProperty(preview, "matches", {
      configurable: true,
      value: (selector: string) => {
        if (selector === ":hover") {
          return false;
        }
        return originalMatches(selector);
      },
    });

    rerender(
      <AnchorPreview
        {...ANCHOR_BASE_PROPS}
        hasChildPopup={false}
        onMouseLeave={onMouseLeave}
      />,
    );

    expect(onMouseLeave).toHaveBeenCalledOnce();
  });

  it("子がいない anchor preview は外側 mousedown で閉じる", () => {
    const onMouseLeave = vi.fn();
    render(
      <AnchorPreview
        {...ANCHOR_BASE_PROPS}
        hasChildPopup={false}
        onMouseLeave={onMouseLeave}
      />,
    );

    fireEvent.mouseDown(document.body);

    expect(onMouseLeave).toHaveBeenCalledOnce();
  });

  it("兄弟のpopup surfaceへマウス移動しても close しない", () => {
    const onMouseLeave = vi.fn();
    render(
      <>
        <AnchorPreview {...ANCHOR_BASE_PROPS} onMouseLeave={onMouseLeave} />
        <div data-popup-surface="true">menu</div>
      </>,
    );

    const preview = document.querySelector(".anchor-preview") as HTMLElement;
    const siblingSurface = screen.getByText("menu");

    act(() => {
      fireEvent.mouseLeave(preview, { relatedTarget: siblingSurface });
    });

    expect(onMouseLeave).not.toHaveBeenCalled();
  });
});

describe("ResPopup mouseleave behavior", () => {
  afterEach(() => {
    cleanup();
  });

  it("兄弟のpopup surfaceへマウス移動しても onMouseLeave callback を流さない", () => {
    const onMouseLeave = vi.fn();
    render(
      <>
        <ResPopup
          {...RES_BASE_PROPS}
          onClose={() => {}}
          onMouseLeave={onMouseLeave}
        />
        <div data-popup-surface="true">menu</div>
      </>,
    );

    const popup = document.querySelector(".res-popup") as HTMLElement;
    const siblingSurface = screen.getByText("menu");

    act(() => {
      fireEvent.mouseLeave(popup, { relatedTarget: siblingSurface });
    });

    expect(onMouseLeave).not.toHaveBeenCalled();
  });
});

describe("usePopupManager zustand scopes", () => {
  afterEach(() => {
    cleanup();
  });

  it("closeNonContextPopups は contextMenu だけを残す", () => {
    function CloseNonContextHarness() {
      const popupManager = usePopupManager("close-non-context");

      return (
        <div>
          <button
            onClick={() => {
              popupManager.addPopup({
                type: "tree",
                x: 8,
                y: 8,
                payload: { resNum: 1, anchorPreviewDepth: 0 },
              });
              popupManager.addPopup({
                type: "contextMenu",
                x: 16,
                y: 16,
                payload: { items: [] },
              });
            }}
          >
            open
          </button>
          <button onClick={popupManager.closeNonContextPopups}>
            close-non-context
          </button>
          <output data-testid="close-non-context-types">
            {popupManager.popups.map((item) => item.type).join("|")}
          </output>
        </div>
      );
    }

    render(<CloseNonContextHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByTestId("close-non-context-types")).toHaveTextContent(
      "tree|contextMenu",
    );

    fireEvent.click(screen.getByRole("button", { name: "close-non-context" }));
    expect(screen.getByTestId("close-non-context-types")).toHaveTextContent(
      "contextMenu",
    );
  });

  it("scope ごとに popup state を分離する", () => {
    function ScopedPopupHarness() {
      const leftScope = usePopupManager("left-tab");
      const rightScope = usePopupManager("right-tab");

      return (
        <div>
          <button
            onClick={() => {
              leftScope.addPopup({
                type: "tree",
                x: 8,
                y: 8,
                payload: { resNum: 1, anchorPreviewDepth: 0 },
              });
            }}
          >
            left
          </button>
          <button
            onClick={() => {
              rightScope.addPopup({
                type: "tree",
                x: 16,
                y: 16,
                payload: { resNum: 2, anchorPreviewDepth: 0 },
              });
            }}
          >
            right
          </button>
          <output data-testid="left-count">{leftScope.popups.length}</output>
          <output data-testid="right-count">{rightScope.popups.length}</output>
        </div>
      );
    }

    render(<ScopedPopupHarness />);

    fireEvent.click(screen.getByRole("button", { name: "left" }));
    expect(screen.getByTestId("left-count")).toHaveTextContent("1");
    expect(screen.getByTestId("right-count")).toHaveTextContent("0");

    fireEvent.click(screen.getByRole("button", { name: "right" }));
    expect(screen.getByTestId("left-count")).toHaveTextContent("1");
    expect(screen.getByTestId("right-count")).toHaveTextContent("1");
  });
});
