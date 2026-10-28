import { type ReactNode, useEffect } from "react";
import { useMediaImageStore } from "src/features/media/browser/use-media-image-store";
import { WriteSessionProvider } from "src/features/write/browser/use-write-session";
import type { IRes } from "src/service-container/interfaces";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { TAB_ACTION_TYPES } from "src/view/browser/state/tabs/tab-store-types";
import {
  TabProvider,
  useSidePanelState,
  useTabStore,
} from "src/view/browser/state/tabs/use-tab-store";
import {
  publishThreadSnapshot,
  removeThreadSnapshot,
} from "src/view/browser/state/thread-snapshot";
import type { ThreadPage } from "src/view/browser/types";

export const STORY_THREAD: ThreadPage = {
  type: "thread",
  title: "Storybook サンプルスレッド",
  threadUrl: "https://example.com/test/read.cgi/story/1234567890/",
};

const STORY_IMAGE_URL = "https://example.com/images/storybook-sample.svg";
const STORY_IMAGE_DATA_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#26384d"/><circle cx="320" cy="190" r="105" fill="#70c1b3"/><path d="M0 350 165 220l110 90 100-130 265 240H0Z" fill="#e6c78a"/><text x="320" y="390" text-anchor="middle" fill="white" font-family="sans-serif" font-size="24">Storybook image</text></svg>',
)}`;
const STORY_IMAGE_RESPONSE: IRes = {
  num: 1,
  name: "名無しさん",
  mail: "",
  date: "2026/10/27(火) 12:34:56",
  message: `${STORY_IMAGE_URL} サンプル画像`,
};
const STORY_RESPONSES = [STORY_IMAGE_RESPONSE];
const STORY_SNAPSHOT_OWNER = Symbol("storybook-side-panel");

export function PanelStoryEnvironment({
  children,
  sidePanelView,
}: {
  children: ReactNode;
  sidePanelView?: string;
}) {
  return (
    <TabProvider>
      <WriteSessionProvider>
        <PanelStorySeeder sidePanelView={sidePanelView}>{children}</PanelStorySeeder>
      </WriteSessionProvider>
    </TabProvider>
  );
}

function PanelStorySeeder({
  children,
  sidePanelView,
}: {
  children: ReactNode;
  sidePanelView?: string;
}) {
  const { viewPage, viewTab, dispatch } = useTabStore();
  const { dispatch: dispatchGlobal } = useSidePanelState();

  useEffect(() => {
    if (viewPage.type !== "thread" || viewPage.threadUrl !== STORY_THREAD.threadUrl) {
      dispatch(tabActions.navigate(STORY_THREAD));
    }
  }, [dispatch, viewPage]);

  useEffect(() => {
    if (!sidePanelView) return;
    dispatchGlobal({
      type: TAB_ACTION_TYPES.UPDATE_SIDE_PANEL,
      sidePanel: {
        isOpen: true,
        width: 380,
        views: ["boards", "favorites", "images", "extract", "properties", "write"],
        activeView: sidePanelView,
      },
    });
  }, [dispatchGlobal, sidePanelView]);

  useEffect(() => {
    if (viewPage.type !== "thread" || viewPage.threadUrl !== STORY_THREAD.threadUrl) return;
    publishThreadSnapshot(viewTab.id, STORY_SNAPSHOT_OWNER, {
      threadUrl: STORY_THREAD.threadUrl,
      responses: STORY_RESPONSES,
      visibleResponses: STORY_RESPONSES,
      replyIndex: new Map(),
      messageProtocol: "https:",
      blurredResNums: new Set(),
      imageBlurRadius: 4,
      updatedAt: Date.now(),
      loading: false,
      error: null,
      expired: false,
    });
    return () => removeThreadSnapshot(viewTab.id, STORY_SNAPSHOT_OWNER);
  }, [viewPage, viewTab.id]);

  useEffect(() => {
    useMediaImageStore.setState((state) => ({
      images: new Map(state.images).set(STORY_IMAGE_URL, {
        status: "loaded",
        version: 1,
        fallbackSrc: STORY_IMAGE_DATA_URL,
        sourceUrl: STORY_IMAGE_URL,
      }),
    }));
    return () => {
      useMediaImageStore.setState((state) => {
        const images = new Map(state.images);
        images.delete(STORY_IMAGE_URL);
        return { images };
      });
    };
  }, []);

  return <>{children}</>;
}
