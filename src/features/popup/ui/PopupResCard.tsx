import React, { useMemo, useState } from "react";
import { extractUrlsFromMessage } from "src/core/util/url-media";
import { useImgurAlbumMedia } from "src/features/media/application/imgur-album";
import { ResMediaGallery } from "src/features/media/ui/ResMediaGallery";
import {
  useIsNgTemporarilyDisabled,
  useNgDisplayMode,
} from "src/features/ng/browser/use-ng-status";
import { NgBadge } from "src/features/ng/ui/NgBadge";
import { usePopupResCardShared } from "src/features/popup/browser/popup-res-card-context";
import { useIsRepeatedReply } from "src/features/popup/browser/repeated-reply-context";
import { ResBody } from "src/features/thread/ui/ResBody";
import type { IRes } from "src/service-container";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { getEventTargetElement } from "src/view/browser/utils/dom";
import { getIdHeatColor } from "src/view/browser/utils/id-heat";
import { resolveNgDisplayMode } from "src/view/browser/utils/ng-display-mode";
import { getReplyHeatLevel } from "src/view/browser/utils/reply-heat";
import { decodeResponseHtml } from "src/view/browser/utils/response-format";

export const PopupResCard: React.FC<StaticResCardProps> = React.memo(
  ({ res, anchorPreviewDepth, repIndex, disableRepClick, isHighlighted, isFocused }) => {
    const {
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
      onOpenRootReplyTree,
      resolveReplyTreeRoot,
      displayedTreeRootResNum,
      onAnchorClick,
      onAnchorHover,
      onAnchorLeave,
      onContextMenu,
    } = usePopupResCardShared();
    const isImageBlurred = blurredResNums?.has(res.num);
    const isOwn = ownResNums?.has(res.num);
    const isReplyToOwn = replyToOwnResNums?.has(res.num);
    const { window: viewWindow } = useViewSurface();
    const isNgTemporarilyDisabled = useIsNgTemporarilyDisabled();
    // ResItemと同じく、collapseルールの折りたたみを全体設定より優先する。
    const ngDisplayMode = resolveNgDisplayMode(useNgDisplayMode(), res.ng);
    const decoded = useMemo(() => decodeResponseHtml(res, messageProtocol), [messageProtocol, res]);
    // ポップアップも自動更新中の親再描画に巻き込まれるため、同じHTMLの再代入を避けて
    // 選択中のText nodeを維持する。
    const nameMarkup = useMemo(() => ({ __html: decoded.nameHtml }), [decoded.nameHtml]);
    const urls = useMemo(() => extractUrlsFromMessage(decoded.messageHtml), [decoded.messageHtml]);
    const resolvedMedia = useImgurAlbumMedia(decoded.messageHtml, urls, threadKey);
    const treeRootResNum = useMemo(
      () => resolveReplyTreeRoot(res.num),
      [resolveReplyTreeRoot, res.num],
    );
    const showOpenRootReplyTree = canOpenRootReplyTree(
      res.num,
      treeRootResNum,
      displayedTreeRootResNum,
    );

    // repIndex が渡された場合のみ返信数を表示する
    const repCount = repIndex?.get(res.num)?.size ?? 0;
    const replyHeat = getReplyHeatLevel(repCount);
    const resNumClassName = `res__num${
      replyHeat === "hot" ? " res__num--hot" : replyHeat === "warm" ? " res__num--warm" : ""
    }`;
    const repClassName = `res__rep${
      replyHeat === "hot"
        ? " res__rep--hot"
        : replyHeat === "warm"
          ? " res__rep--warm"
          : " res__rep--link"
    }`;
    // idIndex が渡された場合のみ同一IDのレス数を表示してクリック可能にする
    const isRepeatedReply = useIsRepeatedReply(res.num);
    const idCount = res.id ? (idIndex?.get(res.id)?.size ?? 0) : 0;

    // NG 判定は ResItem と同じロジック
    const isNgMatched = res.ng != null || res.class?.includes("ng");
    const isNgActive = !isNgTemporarilyDisabled && isNgMatched;
    const isNgHighlighted = isNgMatched && ngDisplayMode === "highlight-ng";
    const [isNgRevealed, setIsNgRevealed] = useState(false);
    const canRevealNg = ngDisplayMode === "soft-ng";
    // 表示方式の変更後に以前の一時表示を引き継がず、各方式のNG方針を保つ。
    // 描画中に state を直すのは、effect で直すと一度古い表示が描かれるため。条件が偽になるので再描画は一度で終わる。
    if (!canRevealNg && isNgRevealed) {
      setIsNgRevealed(false);
    }
    if (isNgActive && ngDisplayMode === "hard-ng") {
      // 通常レスと同じhard-ngを適用し、ポップアップだけから本文を覗けないようにする。
      return null;
    }
    if (isNgActive && canRevealNg && !isNgRevealed) {
      return (
        <article
          className="res res--ng-placeholder"
          role="button"
          aria-label="クリックして内容を表示"
          tabIndex={0}
          onClick={() => setIsNgRevealed(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsNgRevealed(true);
            }
          }}
        >
          <header className="res__header">
            <span className={resNumClassName}>{res.num}</span>
            <NgBadge result={res.ng} />
          </header>
          <div className="res__ng-reveal">クリックして内容を表示</div>
        </article>
      );
    }

    return (
      <article
        className={[
          "res",
          isHighlighted ? "res--highlighted-persistent" : "",
          isFocused ? "res--highlighted-soft" : "",
          isNgHighlighted ? "res--ng-highlight" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          if (
            getEventTargetElement(e.target, viewWindow)?.closest(
              "a, .res__thumb, .res__media-embed",
            )
          ) {
            // popup 内でもリンク/画像の右クリックは既定メニューを優先する。
            return;
          }
          e.preventDefault();
          onContextMenu(e, res);
        }}
      >
        <header className="res__header">
          <span className={resNumClassName}>{res.num}</span>
          <span className="res__name" dangerouslySetInnerHTML={nameMarkup} />
          {/* 変更理由: ポップアップにも同じスレッドの返信関係を渡し、本文表示との認識を揃える。 */}
          {isOwn ? <span className="res__badge res__badge--own">自分</span> : null}
          {isReplyToOwn ? <span className="res__badge res__badge--reply-to-own">返信</span> : null}
          {isNgMatched ? <NgBadge result={res.ng} /> : null}
          {isNgActive && canRevealNg && isNgRevealed ? (
            <button
              type="button"
              className="res__ng-hide"
              aria-label={`レス${res.num}をNG表示に戻す`}
              onClick={(event) => {
                event.stopPropagation();
                // NG判定は変更せず、ポップアップ内の一時表示だけをプレースホルダーへ戻す。
                setIsNgRevealed(false);
              }}
            >
              再非表示
            </button>
          ) : null}
          {res.id && (
            <span
              title={isRepeatedReply ? "このポップアップ内で同じレスに複数回返信したID" : undefined}
              className={`res__id${isRepeatedReply ? " res__id--repeated-reply" : ""}${
                idCount >= 5 ? " res__id--freq" : idCount >= 2 ? " res__id--link" : ""
              }`}
              // popup側も本文と同じ色スケールを使い、ID密度の見え方を統一する。
              style={{ color: getIdHeatColor(idCount) }}
              onClick={(e) => {
                e.stopPropagation();
                onIdLinkClick(res.id!, e);
              }}
            >
              {res.id}
              {idCount >= 2 && `(${idCount})`}
            </span>
          )}
          <span className="res__date">{res.date ?? res.other}</span>
          {repCount > 0 && onRepClick && (
            <span
              className={repClassName}
              title={disableRepClick ? "右クリックで直接返信を表示" : undefined}
              onClick={(e) => {
                // 参照元レスの「返信」は同一ツリーを再帰的に開いてしまうため、
                // 返信ポップアップ内では明示的に無効化する。
                if (disableRepClick) {
                  e.stopPropagation();
                  return;
                }
                e.stopPropagation();
                onRepClick(res.num, e);
              }}
              onContextMenu={(e) => {
                // レス全体のメニューではなく、直接返信だけの表示を開く。
                e.preventDefault();
                e.stopPropagation();
                onRepClick(res.num, e);
              }}
            >
              返信({repCount})
            </span>
          )}
          {/* ポップアップの種類ではなく、押した時に開くツリーで表示を決める。 */}
          {showOpenRootReplyTree && (
            <button
              type="button"
              className="res__open-root-tree-btn"
              onClick={(e) => {
                // アンカーの葉からでも議論の起点へ辿れるよう、
                // 返信ツリーの開始レスを呼び出し元で解決してから開く。
                e.stopPropagation();
                onOpenRootReplyTree(res.num, e);
              }}
            >
              ツリー先頭から
            </button>
          )}
        </header>
        <ResBody
          messageHtml={resolvedMedia.messageHtml}
          anchorPreviewDepth={anchorPreviewDepth}
          ngResNums={ngResNums}
          resMap={resMap}
          onUrlClick={(url, button, mode) => onUrlClick(url, undefined, button, mode)}
          onUrlContextMenu={(url, e, mode) => onUrlContextMenu(url, e, mode)}
          onMiddleClickStart={onLinkMiddleClickStart}
          onIdLinkClick={onIdLinkClick}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={onAnchorLeave}
        />
        <ResMediaGallery
          urls={resolvedMedia.urls}
          onUrlClick={onUrlClick}
          onMiddleClickStart={onLinkMiddleClickStart}
          openOnMiddleMouseDown
          isBlurred={isImageBlurred}
          blurReason={res.imageBlurReason}
        />
      </article>
    );
  },
);
PopupResCard.displayName = "PopupResCard";

/**
 * 「ツリー先頭から」を押して、今見ているものと違うツリーが開くときだけ表示する。
 * - 起点が自分自身なら、開くのは自分への返信ツリーで「返信(N)」と同じになる。
 * - 表示中の返信ツリーと同じ起点なら、全体がすでに見えている。
 */
function canOpenRootReplyTree(
  resNum: number,
  treeRootResNum: number,
  displayedTreeRootResNum: number | undefined,
): boolean {
  if (treeRootResNum === resNum) return false;
  return treeRootResNum !== displayedTreeRootResNum;
}
export interface StaticResCardProps {
  res: IRes;
  anchorPreviewDepth: number;
  /** 渡された場合、ヘッダーに返信数ボタンを表示する。ツリー専用の索引を使う場合があるため、共通設定とは別に渡す。 */
  repIndex?: Map<number, Set<number>>;
  /** 参照元レスの返信を再帰的に開くのを防ぐための無効化フラグ */
  disableRepClick?: boolean;
  isHighlighted?: boolean;
  /** 操作の起点になった元レスを、参照元より薄く強調する。 */
  isFocused?: boolean;
}
