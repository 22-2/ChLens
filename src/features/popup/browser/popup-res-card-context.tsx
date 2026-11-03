import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import type { IRes } from "src/service-container";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";

/**
 * ポップアップ内のレスカードが、ポップアップ単位で共通に使う設定とハンドラー。
 *
 * 以前は ID・アンカー・返信ツリーの各ポップアップから、ツリーの再帰を含めて
 * 20個近い props を1つずつ手渡ししていた。経路が増えるたびに渡し忘れや
 * 配線の修正が全段に及ぶため、ポップアップ単位で1か所に集める。
 * レスごとに変わる値（res、強調、参照元かどうかなど）は引き続き props で渡す。
 */
export interface PopupResCardShared {
  messageProtocol: string;
  idIndex?: Map<string, Set<number>>;
  /** 本文アンカーの欠損判定をメインスレッドと揃えるためのレス索引 */
  resMap?: ReadonlyMap<number, unknown>;
  /** 親スレッドのURL。ポップアップでも同じ失敗抑止単位を使う。 */
  threadKey?: string;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: ReadonlySet<number>;
  /** 本文中のアンカー先NGレスを強調するためのレス番号集合 */
  ngResNums?: ReadonlySet<number>;
  /** 本文側と同じ自分レス・自分への返信バッヂを表示するための集合 */
  ownResNums?: ReadonlySet<number>;
  replyToOwnResNums?: ReadonlySet<number>;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onLinkMiddleClickStart?: () => void;
  onIdLinkClick: (id: string, e: ReactMouseEvent) => void;
  /** 渡された場合のみ、返信数を押せるようにする。 */
  onRepClick?: (resNum: number, e: ReactMouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onContextMenu?: (e: ReactMouseEvent, res: IRes) => void;
}

const PopupResCardContext = createContext<PopupResCardShared | null>(null);

/** 子孫の PopupResCard へ共通の設定とハンドラーを渡す。値は各フィールドが変わった時だけ作り直す。 */
export function PopupResCardScope({
  children,
  messageProtocol,
  idIndex,
  resMap,
  threadKey,
  blurredResNums,
  ngResNums,
  ownResNums,
  replyToOwnResNums,
  onUrlClick,
  onUrlContextMenu,
  onLinkMiddleClickStart,
  onIdLinkClick,
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onContextMenu,
}: PopupResCardShared & { children: ReactNode }) {
  const value = useMemo<PopupResCardShared>(
    () => ({
      messageProtocol,
      idIndex,
      resMap,
      threadKey,
      blurredResNums,
      ngResNums,
      ownResNums,
      replyToOwnResNums,
      onUrlClick,
      onUrlContextMenu,
      onLinkMiddleClickStart,
      onIdLinkClick,
      onRepClick,
      onAnchorClick,
      onAnchorHover,
      onAnchorLeave,
      onContextMenu,
    }),
    [
      messageProtocol,
      idIndex,
      resMap,
      threadKey,
      blurredResNums,
      ngResNums,
      ownResNums,
      replyToOwnResNums,
      onUrlClick,
      onUrlContextMenu,
      onLinkMiddleClickStart,
      onIdLinkClick,
      onRepClick,
      onAnchorClick,
      onAnchorHover,
      onAnchorLeave,
      onContextMenu,
    ],
  );
  return <PopupResCardContext value={value}>{children}</PopupResCardContext>;
}

export function usePopupResCardShared(): PopupResCardShared {
  const shared = useContext(PopupResCardContext);
  if (!shared) {
    // 黙って既定値で動かすと、リンクやアンカーが無反応のまま原因が分からなくなる。
    throw new Error("PopupResCard は PopupResCardScope の内側で使う必要があります");
  }
  return shared;
}
