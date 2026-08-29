import { decodeCharReference } from "@chlen/ch-lib";
import type {
  CommentBatch,
  CommentCandidate,
  CommentCursor,
  CommentOverlayState,
  CommentProjectionOptions,
  CommentResponse,
} from "./comment-types";

/**
 * レス本文からOverlayで安全に表示できるテキストを作る。
 * HTMLをそのまま渡すとOverlay側の表示責務と安全性が不安定になるため、domainで文字列へ固定する。
 */
export function toCommentText(message: string): string {
  return decodeCharReference(
    message
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\r\n?/g, "\n")
      .trim(),
  );
}

function toCommentAuthor(name: string): string {
  const author = toCommentText(name);
  return author || "名無し";
}

function isNgResponse(response: CommentResponse): boolean {
  return response.ng != null || response.class?.includes("ng") === true;
}

/** レスポンス配列が取得順でなくても、現在の最大レス番号をbaselineにする。 */
export function latestResponseNumber(responses: readonly CommentResponse[]): number {
  return responses.reduce(
    (latest, response) => (Number.isFinite(response.num) ? Math.max(latest, response.num) : latest),
    0,
  );
}

export function projectCommentResponse(
  response: CommentResponse,
  options: CommentProjectionOptions = {},
): CommentCandidate | null {
  if (!options.includeNg && isNgResponse(response)) return null;

  const text = toCommentText(response.message);
  if (!text.trim()) return null;

  return {
    responseNumber: response.num,
    text,
    author: toCommentAuthor(response.name),
    ...(response.id ? { id: response.id } : {}),
    ...(response.date ? { date: response.date } : {}),
  };
}

export function createCommentCursor(
  threadUrl: string,
  responses: readonly CommentResponse[],
): CommentCursor {
  return {
    threadUrl,
    lastResponseNumber: latestResponseNumber(responses),
  };
}

export function createIdleCommentOverlayState(): CommentOverlayState {
  return {
    status: "idle",
    targetThreadUrl: null,
    cursor: null,
  };
}

/** 開始時点のレスを流さず、以後の新着だけを対象にするstateを作る。 */
export function startCommentOverlay(
  threadUrl: string,
  responses: readonly CommentResponse[],
): CommentOverlayState {
  return {
    status: "running",
    targetThreadUrl: threadUrl,
    cursor: createCommentCursor(threadUrl, responses),
  };
}

/** 停止後の再開ではstartCommentOverlayを呼び、再開時点を新しいbaselineにする。 */
export function stopCommentOverlay(state: CommentOverlayState): CommentOverlayState {
  return {
    status: "stopped",
    targetThreadUrl: state.targetThreadUrl,
    cursor: state.cursor,
  };
}

export interface CommentBatchResult {
  state: CommentOverlayState;
  batch: CommentBatch | null;
}

/**
 * 現在のスナップショットから新着コメントを一度だけ取り出す。
 * キャッシュ再描画や取得順の揺れがあっても、レス番号をcursorにして重複送信を防ぐ。
 */
export function collectNewCommentBatch(
  state: CommentOverlayState,
  threadUrl: string,
  responses: readonly CommentResponse[],
  options: CommentProjectionOptions = {},
): CommentBatchResult {
  if (state.status !== "running" || !state.cursor || !state.targetThreadUrl) {
    return { state, batch: null };
  }

  if (state.targetThreadUrl !== threadUrl || state.cursor.threadUrl !== threadUrl) {
    // 変更理由: 実況対象は開始時のスレへ固定するため、表示中タブを切り替えても
    // 別スレのレスを自動採用しない。対象変更は呼び出し側が新baselineで明示的に開始する。
    return {
      state,
      batch: null,
    };
  }

  const lastResponseNumber = state.cursor.lastResponseNumber;
  const uniqueNewResponses = new Map<number, CommentResponse>();
  for (const response of responses) {
    if (
      Number.isFinite(response.num) &&
      response.num > lastResponseNumber &&
      !uniqueNewResponses.has(response.num)
    ) {
      uniqueNewResponses.set(response.num, response);
    }
  }

  const newResponses = [...uniqueNewResponses.values()].sort((left, right) => left.num - right.num);
  const comments = newResponses
    .map((response) => projectCommentResponse(response, options))
    .filter((comment): comment is CommentCandidate => comment !== null);
  const nextLastResponseNumber = Math.max(lastResponseNumber, latestResponseNumber(responses));
  const nextState: CommentOverlayState = {
    ...state,
    cursor: {
      ...state.cursor,
      lastResponseNumber: nextLastResponseNumber,
    },
  };

  return {
    state: nextState,
    batch:
      comments.length > 0
        ? {
            threadUrl,
            comments,
            latestResponseNumber: nextLastResponseNumber,
          }
        : null,
  };
}
