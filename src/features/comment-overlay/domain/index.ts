export {
  collectNewCommentBatch,
  createCommentCursor,
  createIdleCommentOverlayState,
  latestResponseNumber,
  projectCommentResponse,
  startCommentOverlay,
  stopCommentOverlay,
  toCommentText,
} from "./comments";
export type { CommentBatchResult } from "./comments";
export { MemoryCommentOverlayEventBus } from "./events";
export type { CommentOverlayEvent, CommentOverlayEventBus } from "./events";
export type {
  CommentBatch,
  CommentCandidate,
  CommentCursor,
  CommentOverlayState,
  CommentOverlayStatus,
  CommentProjectionOptions,
  CommentResponse,
} from "./comment-types";
