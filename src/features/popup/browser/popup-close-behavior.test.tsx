import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TreePopupItem } from "src/features/popup/browser/popup-types";
import { usePopupCore } from "src/features/popup/browser/use-popup-manager";
import { AnchorPreview } from "src/features/popup/ui/AnchorPreview";
import { ReplyTreePopup } from "src/features/popup/ui/ReplyTreePopup";
import { ResPopup } from "src/features/popup/ui/ResPopup";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";
import {
  createRes,
  DUPLICATE_REPLY_INDEX,
  TEST_REP_INDEX,
  TEST_RES_MAP,
} from "src/test-support/popup-test-data";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

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
  onOpenRootReplyTree: () => {},
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

  it("[bug再現] disableOutsideClick が true→false に変わり、かつカーソルが外にあれば自動 close する", () => {
    // 子ポップアップ(anchor/tree)が閉じて disableOutsideClick が false に変わった瞬間、
    // mouseleave は既に無視済みなので自動 close で補完しなければ tree1 が残ったままになる。
    const onClose = vi.fn();
    const { rerender } = render(
      <ReplyTreePopup {...TREE_BASE_PROPS} disableOutsideClick={true} onClose={onClose} />,
    );

    // cursor はポップアップに入っていない（isHovering=false）
    expect(onClose).not.toHaveBeenCalled();

    // 子ポップアップが閉じて disableOutsideClick が false に変わる
    rerender(<ReplyTreePopup {...TREE_BASE_PROPS} disableOutsideClick={false} onClose={onClose} />);

    // カーソルが外にいるので自動 close されるべき
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disableOutsideClick が true→false に変わってもカーソルが内部にあれば close しない", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ReplyTreePopup {...TREE_BASE_PROPS} disableOutsideClick={true} onClose={onClose} />,
    );

    // カーソルがポップアップ内に入る
    const popup = document.querySelector(".res-popup") as HTMLElement;
    // 変更理由: jsdomは:hoverに一致しない（nullではなくfalseを返す）ため、ブラウザでカーソルが内部にある状態を再現する。
    const matchesOriginal = popup.matches.bind(popup);
    vi.spyOn(popup, "matches").mockImplementation((selector: string) =>
      selector === ":hover" ? true : matchesOriginal(selector),
    );
    fireEvent.mouseEnter(popup);

    // 子が閉じて disableOutsideClick が false に変わる
    rerender(<ReplyTreePopup {...TREE_BASE_PROPS} disableOutsideClick={false} onClose={onClose} />);

    // カーソルが内部にあるので close してはいけない
    expect(onClose).not.toHaveBeenCalled();

    // その後カーソルが出ると mouseleave で close される
    vi.spyOn(popup, "matches").mockImplementation(matchesOriginal);
    act(() => {
      fireEvent.mouseLeave(popup);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("子がいない状態（disableOutsideClick=false）で外側 mousedown すると close する", () => {
    const onClose = vi.fn();
    render(<ReplyTreePopup {...TREE_BASE_PROPS} disableOutsideClick={false} onClose={onClose} />);

    // ポップアップ外の領域をクリック
    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("子がいる状態（disableOutsideClick=true）でも外側 mousedown で close する", () => {
    const onClose = vi.fn();
    render(<ReplyTreePopup {...TREE_BASE_PROPS} disableOutsideClick={true} onClose={onClose} />);

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("兄弟のpopupへマウス移動しても close しない", () => {
    const onClose = vi.fn();
    render(
      <>
        <ReplyTreePopup {...TREE_BASE_PROPS} disableOutsideClick={false} onClose={onClose} />
        <div data-popup="true">menu</div>
      </>,
    );

    const popup = document.querySelector(".res-popup") as HTMLElement;
    const siblingPopup = screen.getByText("menu");

    act(() => {
      fireEvent.mouseLeave(popup, { relatedTarget: siblingPopup });
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("兄弟のpopupへマウス移動しても onMouseLeave callback を流さない", () => {
    const onMouseLeave = vi.fn();
    render(
      <>
        <ReplyTreePopup
          {...TREE_BASE_PROPS}
          disableOutsideClick={false}
          onClose={() => {}}
          onMouseLeave={onMouseLeave}
        />
        <div data-popup="true">menu</div>
      </>,
    );

    const popup = document.querySelector(".res-popup") as HTMLElement;
    const siblingPopup = screen.getByText("menu");

    act(() => {
      fireEvent.mouseLeave(popup, { relatedTarget: siblingPopup });
    });

    expect(onMouseLeave).not.toHaveBeenCalled();
  });

  it("親ポップアップを閉じると子コンテキストメニューも一緒に閉じる", () => {
    function PopupTreeHarness() {
      const { popups, addPopup, closePopupById } = usePopupCore();

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
              const treePopup = popups.find((item): item is TreePopupItem => item.type === "tree");
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
    expect(screen.getByTestId("popup-tree-types")).toHaveTextContent("tree|contextMenu");

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
      <AnchorPreview {...ANCHOR_BASE_PROPS} hasChildPopup={true} onMouseLeave={onMouseLeave} />,
    );

    expect(onMouseLeave).not.toHaveBeenCalled();

    rerender(
      <AnchorPreview {...ANCHOR_BASE_PROPS} hasChildPopup={false} onMouseLeave={onMouseLeave} />,
    );

    expect(onMouseLeave).toHaveBeenCalledOnce();
  });

  it("[bug再現] 子プレビューが閉じた時に実際のホバー状態が外なら親プレビューも閉じる", () => {
    const onMouseLeave = vi.fn();
    const { rerender } = render(
      <AnchorPreview {...ANCHOR_BASE_PROPS} hasChildPopup={true} onMouseLeave={onMouseLeave} />,
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
      <AnchorPreview {...ANCHOR_BASE_PROPS} hasChildPopup={false} onMouseLeave={onMouseLeave} />,
    );

    expect(onMouseLeave).toHaveBeenCalledOnce();
  });

  it("子がいない anchor preview は外側 mousedown で閉じる", () => {
    const onMouseLeave = vi.fn();
    render(
      <AnchorPreview {...ANCHOR_BASE_PROPS} hasChildPopup={false} onMouseLeave={onMouseLeave} />,
    );

    fireEvent.mouseDown(document.body);

    expect(onMouseLeave).toHaveBeenCalledOnce();
  });

  it("兄弟のpopupへマウス移動しても close しない", () => {
    const onMouseLeave = vi.fn();
    render(
      <>
        <AnchorPreview {...ANCHOR_BASE_PROPS} onMouseLeave={onMouseLeave} />
        <div data-popup="true">menu</div>
      </>,
    );

    const preview = document.querySelector(".anchor-preview") as HTMLElement;
    const siblingPopup = screen.getByText("menu");

    act(() => {
      fireEvent.mouseLeave(preview, { relatedTarget: siblingPopup });
    });

    expect(onMouseLeave).not.toHaveBeenCalled();
  });
});

describe("ResPopup mouseleave behavior", () => {
  afterEach(() => {
    cleanup();
  });

  it("兄弟のpopupへマウス移動しても onMouseLeave callback を流さない", () => {
    const onMouseLeave = vi.fn();
    render(
      <>
        <ResPopup {...RES_BASE_PROPS} onClose={() => {}} onMouseLeave={onMouseLeave} />
        <div data-popup="true">menu</div>
      </>,
    );

    const popup = document.querySelector(".res-popup") as HTMLElement;
    const siblingPopup = screen.getByText("menu");

    act(() => {
      fireEvent.mouseLeave(popup, { relatedTarget: siblingPopup });
    });

    expect(onMouseLeave).not.toHaveBeenCalled();
  });
});

describe("usePopupCore zustand scopes", () => {
  afterEach(() => {
    cleanup();
  });

  it("closeNonContextPopups は contextMenu だけを残す", () => {
    function CloseNonContextHarness() {
      const popupCore = usePopupCore("close-non-context");

      return (
        <div>
          <button
            onClick={() => {
              popupCore.addPopup({
                type: "tree",
                x: 8,
                y: 8,
                payload: { resNum: 1, anchorPreviewDepth: 0 },
              });
              popupCore.addPopup({
                type: "contextMenu",
                x: 16,
                y: 16,
                payload: { items: [] },
              });
            }}
          >
            open
          </button>
          <button onClick={popupCore.closeNonContextPopups}>close-non-context</button>
          <output data-testid="close-non-context-types">
            {popupCore.popups.map((item) => item.type).join("|")}
          </output>
        </div>
      );
    }

    render(<CloseNonContextHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByTestId("close-non-context-types")).toHaveTextContent("tree|contextMenu");

    fireEvent.click(screen.getByRole("button", { name: "close-non-context" }));
    expect(screen.getByTestId("close-non-context-types")).toHaveTextContent("contextMenu");
  });

  it("scope ごとに popup state を分離する", () => {
    function ScopedPopupHarness() {
      const leftScope = usePopupCore("left-tab");
      const rightScope = usePopupCore("right-tab");

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

// 画像取得の依存から拡張 API を初期化しないよう、画面テストでは通信境界を差し替える。
vi.mock("src/app/platform", () => ({ platform: { http: { fetch: vi.fn() } } }));
