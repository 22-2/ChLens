import { registerDebugStateProvider } from "src/app/debug/debug-api";
import { container } from "src/service-container/index";

import { commentOverlayWindowPlatform, createCommentOverlayEventBus } from "../platform";
import { CommentOverlayController } from "./controller";
import type { CommentOverlayMultiThreadSource } from "./multi-thread-session";
import { readCommentOverlaySettings, subscribeToCommentOverlaySettings } from "./settings";

export type {
  CommentOverlayControllerDependencies,
  CommentOverlayControllerSnapshot,
} from "./controller";
export { CommentOverlayController } from "./controller";
export { readCommentOverlaySettings } from "./settings";

const commentOverlayMultiThreadSource: CommentOverlayMultiThreadSource = {
  getThreads: async (boardUrl) => container.board.getThreads(boardUrl),
  getThread: async (threadUrl) =>
    container.thread.getThread(threadUrl, {
      // 候補はThreadPageの表示対象外なので、既存cacheの鮮度に任せず毎周期取得する。
      forceUpdate: true,
    }),
};

export const commentOverlayController = new CommentOverlayController({
  eventBus: createCommentOverlayEventBus(),
  platform: commentOverlayWindowPlatform,
  getSettings: readCommentOverlaySettings,
  subscribeSettings: subscribeToCommentOverlaySettings,
  multiThreadSource: commentOverlayMultiThreadSource,
});

// 実況中だけ起きる不具合を調べるため、Overlayの対象スレと表示状態を外部CLIへ公開する。
registerDebugStateProvider("commentOverlay", () => commentOverlayController.getSnapshot());
