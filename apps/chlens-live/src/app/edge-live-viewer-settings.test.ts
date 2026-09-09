import type { CommentCandidate } from "src/features/comment-overlay/domain";
import { describe, expect, it } from "vite-plus/test";
import {
  calculateEdgeLiveViewerLaneHeight,
  DEFAULT_EDGE_LIVE_VIEWER_SETTINGS,
  filterEdgeLiveViewerComments,
} from "./edge-live-viewer-settings";

const comments: readonly CommentCandidate[] = [
  { responseNumber: 1, author: "名無し", id: "id-a", text: "通常レス" },
  { responseNumber: 2, author: "NG名", id: "id-b", text: ">>1 アンカー" },
  { responseNumber: 3, author: "名無し", id: "id-c", text: "https://example.com/image.png" },
  { responseNumber: 4, author: "名無し", id: "ng-id", text: "禁止語を含む" },
];

describe("EdgeLiveViewer互換設定", () => {
  it("文字サイズと行間から重ならないlane高を算出する", () => {
    expect(calculateEdgeLiveViewerLaneHeight(31, 30)).toBe(68);
  });

  it("アンカー・URL・ID・名前・本文のNG条件を組み合わせる", () => {
    const result = filterEdgeLiveViewerComments(comments, {
      ...DEFAULT_EDGE_LIVE_VIEWER_SETTINGS,
      hideAnchors: true,
      hideUrls: true,
      ngIds: ["ng-id"],
      ngNames: ["NG名"],
      ngTexts: ["禁止語"],
    });
    expect(result.map((comment) => comment.responseNumber)).toEqual([1]);
  });
});
