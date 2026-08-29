import type { IRes as LiveResponseData } from "@chlen/ch-lib";
import type { MouseEvent, ReactElement } from "react";
import type { IRes as BrowserResponse } from "src/service-container/interfaces";
import { ResItem } from "src/view/browser/components/ResItem";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";

interface LiveResponseProps {
  post: LiveResponseData;
  threadUrl?: string;
  onAnchorClick?: (resNum: number) => void;
  onContextMenu?: (event: MouseEvent, response: BrowserResponse) => void;
}

function toBrowserResponse(post: LiveResponseData): BrowserResponse {
  return {
    num: post.number,
    name: post.name,
    mail: post.mail,
    date: post.date,
    message: post.message,
    other: post.other,
    id: post.id,
    slip: post.slip,
    trip: post.trip,
    be: post.be,
  };
}

function resolveMessageProtocol(threadUrl?: string): string {
  try {
    return new URL(threadUrl ?? "https://example.invalid/").protocol;
  } catch {
    return "https:";
  }
}

const noopIdClick = (): void => undefined;
const noopReplyClick = (): void => undefined;
const noopAnchorHover = (): void => undefined;
const noopAnchorLeave = (): void => undefined;
const noopUrlContextMenu: UrlContextMenuHandler = () => false;

const openExternalUrl: UrlClickHandler = (url) => {
  // 変更理由: ChLensのレス本文/メディア部品はクリック処理を呼び出し側へ委譲するため、
  // Liveでも同じ部品を使い、URLは既存ブラウザの新しいタブへ一貫して委譲する。
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
};

/**
 * LiveのcanonicalレスをChLensのResItemへ変換して表示する。
 * 本文のHTML化・>>アンカー・画像/動画抽出は表示側で共有し、Live固有の取得処理とは分離する。
 */
export function LiveResponse({
  post,
  threadUrl,
  onAnchorClick,
  onContextMenu,
}: LiveResponseProps): ReactElement {
  const response = toBrowserResponse(post);

  return (
    <ResItem
      res={response}
      idPos={response.id ? 1 : 0}
      idCount={response.id ? 1 : 0}
      repCount={0}
      miniAa={false}
      messageProtocol={resolveMessageProtocol(threadUrl)}
      onIdClick={noopIdClick}
      onRepClick={noopReplyClick}
      onUrlClick={openExternalUrl}
      onUrlContextMenu={noopUrlContextMenu}
      onAnchorClick={onAnchorClick ?? (() => undefined)}
      onAnchorHover={noopAnchorHover}
      onAnchorLeave={noopAnchorLeave}
      onContextMenu={(event) => onContextMenu?.(event, response)}
      isOwn={false}
      isReplyToOwn={false}
      isImageBlurred={false}
      imageBlurRadius={4}
      threadUrl={threadUrl}
    />
  );
}
