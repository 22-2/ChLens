import type { IRes } from "src/service-container/interfaces";

/** Overlayへ渡す前に、ChLensのレスを扱いやすい入力形へ限定する。 */
export type CommentResponse = Pick<IRes, "num" | "name" | "message"> &
  Partial<Pick<IRes, "date" | "id" | "ng">> & {
    class?: readonly string[];
  };

export interface CommentCandidate {
  responseNumber: number;
  text: string;
  author: string;
  id?: string;
  date?: string;
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
