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
export {
  calculateCommentDuration,
  calculateCommentPosition,
  calculateCommentSpeed,
  CommentScheduler,
  LaneAllocator,
  DEFAULT_COMMENT_BASE_SPEED_PX_PER_SECOND,
} from "./scheduler";
export type {
  CommentScheduleInput,
  CommentSchedulerOptions,
  CommentSchedulerSnapshot,
  ScheduledComment,
} from "./scheduler";
export type {
  CommentBatch,
  CommentCandidate,
  CommentCursor,
  CommentOverlayState,
  CommentOverlayStatus,
  CommentProjectionOptions,
  CommentResponse,
} from "./comment-types";
