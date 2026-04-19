import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRes } from "src/service-container/interfaces";
import { AnchorPreview } from "src/view/browser/components/AnchorPreview";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { ReplyTreePopup } from "src/view/browser/components/ReplyTreePopup";
import { ResPopup } from "src/view/browser/components/ResPopup";
import { usePopupManager } from "src/view/browser/hooks/use-popup-manager";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
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

const DUPLICATE_REPLY_RES_MAP = new Map<number, IRes>([
  [3, createRes(3, "preview target")],
  [6, createRes(6, "&gt;&gt;3")],
]);

const DUPLICATE_REPLY_INDEX = new Map<number, Set<number>>([
  [3, new Set([6])],
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
  const { popups, addPopup, closePopupById, closePopupsByPredicate } =
    usePopupManager();

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

  const closePopupChildren = (popupId: string) => {
    closePopupsByPredicate((item) => item.parentId === popupId);
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
          onRepClick={handleRepClickInPopup(
            anchorPreview.id,
            anchorPreview.payload.depth + 1,
          )}
          onAnchorClick={() => {}}
          onAnchorHover={showAnchorPreview}
          onAnchorLeave={hideAnchorPreviewsFromDepth}
          onMouseEnter={() => {}}
          onMouseLeave={() => {}}
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
          onRepClick={handleRepClickInPopup(
            treePopup.id,
            treePopup.payload.anchorPreviewDepth,
          )}
          onAnchorClick={() => {}}
          onAnchorHover={(targets, anchorRect, label, depth) =>
            showAnchorPreview(targets, anchorRect, label, depth, treePopup.id)
          }
          onAnchorLeave={hideAnchorPreviewsFromDepth}
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
        />
      ))}

      {contextMenus.map((menu) => (
        <ContextMenu
          key={menu.id}
          x={menu.x}
          y={menu.y}
          items={menu.payload.items}
          onClose={() => closePopupById(menu.id)}
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

    const anchorPreview = document.querySelector(".anchor-preview") as HTMLElement;
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
    expect(screen.getByTestId("popup-stack").textContent).toContain(
      "contextMenu:parent=tree-1",
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

  it("兄弟のpopup surfaceへマウス移動しても close しない", () => {
    const onMouseLeave = vi.fn();
    render(
      <>
        <AnchorPreview
          {...ANCHOR_BASE_PROPS}
          onMouseLeave={onMouseLeave}
        />
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
