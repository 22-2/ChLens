import type { IRes } from "src/service-container/interfaces";

/** Overlayへ渡す前に、ChLensのレスを扱いやすい入力形へ限定する。 */
export type CommentResponse = Pick<IRes, "num" | "name" | "message"> &
  Partial<Pick<IRes, "date" | "id" | "ng">> & {
    class?: readonly string[];
    /** 本文中から抽出した画像URL。テキストを隠して弾幕内へ画像として表示する。 */
    imageUrls?: readonly string[];
    /** 自分のレスだけを黄色枠で表示するための表示層向け状態。 */
    isOwn?: boolean;
  };

export interface CommentCandidate {
  responseNumber: number;
  text: string;
  author: string;
  id?: string;
  date?: string;
  /** EdgeLiveViewerと同じく、画像URLを本文ではなく流れる画像として表示する。 */
  imageUrls?: readonly string[];
  /** システム通知は通常レスと同じqueueを使いながら見た目を分ける。 */
  isSystem?: boolean;
  /** 自分のレスはEdgeLiveViewerと同じ黄色枠で流す。 */
  isOwn?: boolean;
  /** responseNumberが存在しないシステム通知を重複排除するためのキー。 */
  systemId?: string;
  /** 複数スレ実況で同じレス番号を区別する取得元。単一スレ時は未設定のままにする。 */
  sourceThreadUrl?: string;
}

export interface CommentBatch {
  threadUrl: string;
  comments: readonly CommentCandidate[];
  latestResponseNumber: number;
}

export interface CommentCursor {
  threadUrl: string;
  lastResponseNumber: number;
}

export type CommentOverlayStatus = "idle" | "running" | "stopped";

export interface CommentOverlayState {
  status: CommentOverlayStatus;
  targetThreadUrl: string | null;
  cursor: CommentCursor | null;
}

export interface CommentProjectionOptions {
  /** ChLensのNG判定済みレスも明示的に流したいfixture向けの例外。既定では除外する。 */
  includeNg?: boolean;
}
