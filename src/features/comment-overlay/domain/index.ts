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
  calculateLaneCapacity,
  calculateCommentPosition,
  calculateCommentSpeed,
  CommentScheduler,
  LaneAllocator,
  DEFAULT_COMMENT_BACKLOG_POLICY,
  DEFAULT_COMMENT_BASE_SPEED_PX_PER_SECOND,
  DEFAULT_COMMENT_COLLISION_MODE,
  DEFAULT_MAX_ACTIVE_COUNT,
  DEFAULT_MAX_LANE_COUNT,
  DEFAULT_MAX_QUEUE_SIZE,
} from "./scheduler";
export type {
  CommentBacklogPolicy,
  CommentCollisionMode,
  CommentEnqueueResult,
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
export { DEFAULT_COMMENT_OVERLAY_SETTINGS, normalizeCommentOverlaySettings } from "./settings";
export type { CommentOverlaySettings } from "./settings";
