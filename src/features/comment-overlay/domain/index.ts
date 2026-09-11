export type {
  CommentBatch,
  CommentCandidate,
  CommentCursor,
  CommentOverlayState,
  CommentOverlayStatus,
  CommentProjectionOptions,
  CommentResponse,
} from "./comment-types";
export type { CommentBatchResult } from "./comments";
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
export type { CommentOverlayEvent, CommentOverlayEventBus } from "./events";
export { MemoryCommentOverlayEventBus } from "./events";
export type { NaturalCommentFlowOptions } from "./flow";
export { calculateNaturalCommentFlowCount, calculateNaturalCommentFlowInterval } from "./flow";
export type {
  CommentBacklogPolicy,
  CommentCollisionMode,
  CommentEnqueueResult,
  CommentScheduleInput,
  CommentSchedulerOptions,
  CommentSchedulerSnapshot,
  ScheduledComment,
} from "./scheduler";
export {
  calculateCommentDuration,
  calculateCommentPosition,
  calculateCommentSpeed,
  calculateLaneCapacity,
  CommentScheduler,
  DEFAULT_COMMENT_BACKLOG_POLICY,
  DEFAULT_COMMENT_BASE_SPEED_PX_PER_SECOND,
  DEFAULT_COMMENT_COLLISION_MODE,
  DEFAULT_MAX_ACTIVE_COUNT,
  DEFAULT_MAX_LANE_COUNT,
  DEFAULT_MAX_QUEUE_SIZE,
  LaneAllocator,
} from "./scheduler";
export type { CommentOverlaySettings } from "./settings";
export {
  DEFAULT_COMMENT_OVERLAY_SETTINGS,
  MAX_COMMENT_OVERLAY_DURATION_SECONDS,
  MIN_COMMENT_OVERLAY_DURATION_SECONDS,
  normalizeCommentOverlaySettings,
} from "./settings";
