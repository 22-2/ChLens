import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
          onResContextMenu={() => {}}
          hasChildPopup={false}
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
          onResContextMenu={() => {}}
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
});
