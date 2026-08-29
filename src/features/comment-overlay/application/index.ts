import { createCommentOverlayEventBus, commentOverlayWindowPlatform } from "../platform";
import { CommentOverlayController } from "./controller";

export { CommentOverlayController } from "./controller";
export type {
  CommentOverlayControllerDependencies,
  CommentOverlayControllerSnapshot,
} from "./controller";

export const commentOverlayController = new CommentOverlayController({
  eventBus: createCommentOverlayEventBus(),
  platform: commentOverlayWindowPlatform,
});
