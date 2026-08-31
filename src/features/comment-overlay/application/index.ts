import { createCommentOverlayEventBus, commentOverlayWindowPlatform } from "../platform";
import { CommentOverlayController } from "./controller";
import { readCommentOverlaySettings, subscribeToCommentOverlaySettings } from "./settings";

export { CommentOverlayController } from "./controller";
export { readCommentOverlaySettings } from "./settings";
export type {
  CommentOverlayControllerDependencies,
  CommentOverlayControllerSnapshot,
} from "./controller";

export const commentOverlayController = new CommentOverlayController({
  eventBus: createCommentOverlayEventBus(),
  platform: commentOverlayWindowPlatform,
  getSettings: readCommentOverlaySettings,
  subscribeSettings: subscribeToCommentOverlaySettings,
});
