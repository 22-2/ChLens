import type { IRes } from "@chlen/ch-lib";
import {
  collectNewCommentBatch,
  type CommentBatch,
  type CommentOverlayState,
  type CommentResponse,
  createIdleCommentOverlayState,
  startCommentOverlay,
} from "src/features/comment-overlay/domain";
import { extractUrlsFromMessage, toViewerImageUrl } from "src/view/browser/utils/url-media";

import type { LiveEvent } from "./events";

export interface LiveCommentOverlayUpdate {
  threadUrl: string;
  reset: boolean;
  /** スレ移動中も、すでに画面を流れている前スレのコメントを残す。 */
  preserveVisibleComments?: boolean;
  batch: CommentBatch | null;
}

function toCommentResponse(post: IRes): CommentResponse {
  const imageUrls = extractUrlsFromMessage(post.message).filter(
    (url) => toViewerImageUrl(url) != null,
  );
  return {
    num: post.number,
    name: post.name,
    message: post.message,
    ...(post.date ? { date: post.date } : {}),
    ...(post.id ? { id: post.id } : {}),
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
  };
}

/**
 * LiveThreadSessionのsnapshotを、Overlayへ投入する新着batchへ変換する。
 * 初回snapshotと実況対象の切り替えはbaselineにし、既存レスを弾幕として再送しない。
 */
export class LiveCommentOverlayController {
  private state: CommentOverlayState = createIdleCommentOverlayState();

  private targetThreadUrl: string | null = null;

  consume(event: LiveEvent): LiveCommentOverlayUpdate | null {
    if (event.type !== "snapshot") return null;

    const responses = event.snapshot.data.posts.map(toCommentResponse);
    if (this.targetThreadUrl !== event.threadUrl) {
      // 変更理由: Mainで実況対象を切り替えたときに新スレの全既存レスを流すと、
      // Overlayが過去ログ再生のようになるため、最初のsnapshotを新しいbaselineにする。
      this.targetThreadUrl = event.threadUrl;
      this.state = startCommentOverlay(event.threadUrl, responses);
      return {
        threadUrl: event.threadUrl,
        reset: true,
        preserveVisibleComments: true,
        batch: null,
      };
    }

    const result = collectNewCommentBatch(this.state, event.threadUrl, responses);
    this.state = result.state;
    return { threadUrl: event.threadUrl, reset: false, batch: result.batch };
  }
}
