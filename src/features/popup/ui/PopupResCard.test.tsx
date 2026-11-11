import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NgStatusProvider, useNgStatus } from "src/features/ng/browser/use-ng-status";
import {
  PopupResCardScope,
  type PopupResCardShared,
} from "src/features/popup/browser/popup-res-card-context";
import type { StaticResCardProps } from "src/features/popup/ui/PopupResCard";
import { PopupResCard as BasePopupResCard } from "src/features/popup/ui/PopupResCard";
import type { IRes } from "src/service-container/interfaces";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const ngMocks = vi.hoisted(() => ({
  configValue: "soft-ng",
  configUpdatedCallback: undefined as ((data: { key?: string }) => void) | undefined,
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      // 変更理由: 既定値を外部リンク確認・画像の手動取得ありへ変えたため、リンクと画像の既定動作を見る本テストではoffにする。
      get: (key: string) => {
        if (key === "display_ng") return ngMocks.configValue;
        return key === "confirm_external_links" || key === "manual_image_loading" ? "off" : null;
      },
      ready: (callback: () => void) => callback(),
    },
    message: {
      on: (_type: string, callback: (data: { key?: string }) => void) => {
        ngMocks.configUpdatedCallback = callback;
      },
      off: () => {},
    },
  },
}));

afterEach(() => {
  cleanup();
  ngMocks.configValue = "soft-ng";
  ngMocks.configUpdatedCallback = undefined;
});

vi.mock("src/view/browser/utils/response-format", async () => {
  const actual = await vi.importActual<typeof import("src/view/browser/utils/response-format")>(
    "src/view/browser/utils/response-format",
  );
  return {
    ...actual,
    decodeResponseHtml: () => ({
      nameHtml: "名無しさん",
      mailHtml: "",
      otherHtml: "",
      messageHtml: "本文",
      isNameAnchor: false,
    }),
  };
});

vi.mock("src/core/util/url-media", async () => {
  const actual =
    await vi.importActual<typeof import("src/core/util/url-media")>("src/core/util/url-media");
  return {
    ...actual,
    extractUrlsFromMessage: () => ["https://example.com/image.jpg"],
    toViewerImageUrl: (rawUrl: string) => rawUrl,
  };
});

// 共通のハンドラー・設定は PopupResCardScope で渡す設計になったため、
// 各テストでは従来どおり1つの props として書けるよう、ここで分けて渡す。
type TestCardProps = StaticResCardProps &
  Omit<PopupResCardShared, "onRepClick" | "onOpenRootReplyTree" | "resolveReplyTreeRoot"> & {
    onRepClick?: PopupResCardShared["onRepClick"];
    onOpenRootReplyTree?: PopupResCardShared["onOpenRootReplyTree"];
    resolveReplyTreeRoot?: PopupResCardShared["resolveReplyTreeRoot"];
    isImageBlurred?: boolean;
    isOwn?: boolean;
    isReplyToOwn?: boolean;
  };

function PopupResCard({
  res,
  anchorPreviewDepth,
  repIndex,
  disableRepClick,
  isHighlighted,
  isFocused,
  onOpenRootReplyTree = () => {},
  // 既定では起点が自分自身（遡る先がない）とみなす。
  resolveReplyTreeRoot = (resNum) => resNum,
  isImageBlurred,
  isOwn,
  isReplyToOwn,
  ...shared
}: TestCardProps) {
  return (
    <PopupResCardScope
      {...shared}
      onOpenRootReplyTree={onOpenRootReplyTree}
      resolveReplyTreeRoot={resolveReplyTreeRoot}
      blurredResNums={isImageBlurred ? new Set([res.num]) : undefined}
      ownResNums={isOwn ? new Set([res.num]) : undefined}
      replyToOwnResNums={isReplyToOwn ? new Set([res.num]) : undefined}
    >
      <BasePopupResCard
        res={res}
        anchorPreviewDepth={anchorPreviewDepth}
        repIndex={repIndex}
        disableRepClick={disableRepClick}
        isHighlighted={isHighlighted}
        isFocused={isFocused}
      />
    </PopupResCardScope>
  );
}

const BASE_RES: IRes = {
  num: 10,
  name: "名無しさん",
  mail: "",
  date: "2026/04/20",
  message: "https://example.com/image.jpg",
};

function TemporarilyDisabledNgCard({ res }: { res: IRes }) {
  const { setNgTemporarilyDisabled } = useNgStatus();
  return (
    <>
      <button type="button" onClick={() => setNgTemporarilyDisabled(true)}>
        一時NG解除
      </button>
      <PopupResCard
        res={res}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />
    </>
  );
}

describe("PopupResCard", () => {
  it("ポップアップ内でも自分レスと自分への返信バッヂを表示する", () => {
    const { container } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        isOwn
        isReplyToOwn
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    expect(container.querySelector(".res__badge--own")).toHaveTextContent("自分");
    expect(container.querySelector(".res__badge--reply-to-own")).toHaveTextContent("返信");
  });

  it("返信数に応じてレス番号と返信ラベルへ同じ強調色クラスを適用する", () => {
    const repIndex = new Map<number, Set<number>>([[10, new Set([1, 2, 3])]]);

    const { container, rerender } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        repIndex={repIndex}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onRepClick={() => {}}
      />,
    );

    expect(container.querySelector(".res__num")).toHaveClass("res__num--warm");
    expect(container.querySelector(".res__rep")).toHaveClass("res__rep--warm");

    const hotRepIndex = new Map<number, Set<number>>([[10, new Set([1, 2, 3, 4, 5])]]);

    rerender(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        repIndex={hotRepIndex}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onRepClick={() => {}}
      />,
    );

    expect(container.querySelector(".res__num")).toHaveClass("res__num--hot");
    expect(container.querySelector(".res__rep")).toHaveClass("res__rep--hot");
  });

  it("soft-ngではポップアップのNGレスを表示・再非表示・再表示できる", () => {
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;
    const { container, getByRole } = render(
      <PopupResCard
        res={ngRes}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    expect(container.querySelector(".res__body")).not.toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "クリックして内容を表示" }));
    expect(container.querySelector(".res__body")).toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "レス10をNG表示に戻す" }));

    expect(getByRole("button", { name: "クリックして内容を表示" })).toBeInTheDocument();
    expect(container.querySelector(".res__body")).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "クリックして内容を表示" }));
    expect(container.querySelector(".res__body")).toBeInTheDocument();
  });

  it("hard-ngではNGレスのポップアップを描画しない", () => {
    ngMocks.configValue = "hard-ng";
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;

    const { container } = render(
      <NgStatusProvider>
        <PopupResCard
          res={ngRes}
          messageProtocol="https:"
          anchorPreviewDepth={0}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onAnchorClick={() => {}}
          onAnchorHover={() => {}}
          onAnchorLeave={() => {}}
        />
      </NgStatusProvider>,
    );

    expect(container.querySelector(".res")).not.toBeInTheDocument();
  });

  it("highlight-ngではNGレスの本文を表示し、強調クラスを付ける", () => {
    ngMocks.configValue = "highlight-ng";
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;

    const { container } = render(
      <NgStatusProvider>
        <PopupResCard
          res={ngRes}
          messageProtocol="https:"
          anchorPreviewDepth={0}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onAnchorClick={() => {}}
          onAnchorHover={() => {}}
          onAnchorLeave={() => {}}
        />
      </NgStatusProvider>,
    );

    expect(container.querySelector(".res")).toHaveClass("res--ng-highlight");
    expect(container.querySelector(".res__body")).toBeInTheDocument();
  });

  it("display_ng変更通知で既存ポップアップの表示方式を更新する", () => {
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;
    const { container } = render(
      <NgStatusProvider>
        <PopupResCard
          res={ngRes}
          messageProtocol="https:"
          anchorPreviewDepth={0}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onAnchorClick={() => {}}
          onAnchorHover={() => {}}
          onAnchorLeave={() => {}}
        />
      </NgStatusProvider>,
    );

    expect(container.querySelector(".res__body")).not.toBeInTheDocument();

    ngMocks.configValue = "hard-ng";
    act(() => {
      ngMocks.configUpdatedCallback?.({ key: "display_ng" });
    });

    expect(container.querySelector(".res")).not.toBeInTheDocument();
  });

  it("一時NG解除中もNGバッジを残す", () => {
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;
    const { container, getByRole } = render(
      <NgStatusProvider>
        <TemporarilyDisabledNgCard res={ngRes} />
      </NgStatusProvider>,
    );

    fireEvent.click(getByRole("button", { name: "一時NG解除" }));

    expect(container.querySelector(".res__body")).toBeInTheDocument();
    expect(container.querySelector(".res__badge--ng")).toHaveTextContent("NG");
  });

  it("サムネイルのミドルクリックで新規タブ扱いを1回だけ発火する", () => {
    const onUrlClick = vi.fn();
    const onLinkMiddleClickStart = vi.fn();

    const { container } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={onUrlClick}
        onUrlContextMenu={() => {}}
        onLinkMiddleClickStart={onLinkMiddleClickStart}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const thumb = container.querySelector("a.res__thumb") as HTMLAnchorElement;
    fireEvent.mouseDown(thumb, { button: 1 });
    fireEvent(
      thumb,
      new MouseEvent("auxclick", {
        button: 1,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(onUrlClick).toHaveBeenCalledTimes(1);
    expect(onUrlClick).toHaveBeenCalledWith(
      "https://example.com/image.jpg",
      ["https://example.com/image.jpg"],
      1,
    );
    expect(onLinkMiddleClickStart).toHaveBeenCalled();
  });

  it("サムネイル右クリックではビューアのメニューを開く", () => {
    const onContextMenu = vi.fn();

    const { container } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={onContextMenu}
      />,
    );

    const thumb = container.querySelector("a.res__thumb") as HTMLAnchorElement;
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      thumb.dispatchEvent(contextMenuEvent);
    });

    expect(onContextMenu).not.toHaveBeenCalled();
    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole("menuitem", { name: "ビューアで開く" })).toBeInTheDocument();
  });

  it("ポップアップ本文のID右クリックはヘッダーと同じレスメニューを開く", () => {
    const onContextMenu = vi.fn((_event: React.MouseEvent, _res: IRes) => {});
    const res = { ...BASE_RES, id: "HEADER" };
    const { container } = render(
      <PopupResCard
        res={res}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={onContextMenu}
      />,
    );
    const body = container.querySelector(".res__body")!;
    body.insertAdjacentHTML("beforeend", '<a class="anchor_id"><span>ID:OTHER</span></a>');
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    act(() => {
      container
        .querySelector(".res__id")!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      body.querySelector(".anchor_id span")!.dispatchEvent(event);
    });
    expect(onContextMenu).toHaveBeenCalledTimes(2);
    expect(onContextMenu.mock.calls.map((call) => call[1])).toEqual([res, res]);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    { name: "起点が自分自身なら出さない", root: 10, displayed: undefined, visible: false },
    { name: "表示中のツリーと同じ起点なら出さない", root: 3, displayed: 3, visible: false },
    { name: "別のツリーへ遡れるなら出す", root: 3, displayed: undefined, visible: true },
    { name: "表示中のツリーより上へ遡れるなら出す", root: 3, displayed: 5, visible: true },
  ])("「ツリー先頭から」: $name", ({ root, displayed, visible }) => {
    render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        resolveReplyTreeRoot={() => root}
        displayedTreeRootResNum={displayed}
      />,
    );
    expect(screen.queryByRole("button", { name: "ツリー先頭から" }) !== null).toBe(visible);
  });

  it("ルート起点ボタン押下で先頭ツリー展開ハンドラを呼ぶ", () => {
    const onOpenRootReplyTree = vi.fn();
    const repIndex = new Map<number, Set<number>>([[10, new Set([1, 2])]]);

    const { getByRole } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        repIndex={repIndex}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onRepClick={() => {}}
        onOpenRootReplyTree={onOpenRootReplyTree}
        resolveReplyTreeRoot={() => 3}
      />,
    );

    fireEvent.click(getByRole("button", { name: "ツリー先頭から" }));
    expect(onOpenRootReplyTree).toHaveBeenCalledWith(10, expect.any(Object));
  });
});

// 画像取得の依存から拡張 API を初期化しないよう、画面テストでは通信境界を差し替える。
vi.mock("src/app/platform", () => ({ platform: { http: { fetch: vi.fn() } } }));
