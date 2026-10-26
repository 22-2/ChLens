import { describe, expect, it } from "vite-plus/test";

import {
  type ArchiveReplayPosition,
  getArchiveReplayThreadCapabilities,
  isArchiveReplayThread,
} from "./position-store";

const position: ArchiveReplayPosition = {
  version: 1,
  sessionId: "replay-1",
  generation: 1,
  tabId: "tab-replay",
  threadUrl: "https://example.com/test/read.cgi/board/123/",
  responseNumber: 10,
  title: "架空の実況スレ",
  playbackAt: Date.parse("2026-10-02T12:01:00+09:00"),
};

describe("過去実況スレッドの判定", () => {
  it("同期先のタブと正規化したURLが一致するスレッドを過去実況として扱う", () => {
    expect(
      isArchiveReplayThread(position, "tab-replay", "https://example.com/test/read.cgi/board/123"),
    ).toBe(true);
  });

  it("同じURLでも別タブのスレッドは通常表示として扱う", () => {
    expect(isArchiveReplayThread(position, "tab-regular", position.threadUrl)).toBe(false);
  });

  it("同じタブでも別スレッドは通常表示として扱う", () => {
    expect(
      isArchiveReplayThread(position, "tab-replay", "https://example.com/test/read.cgi/board/456/"),
    ).toBe(false);
  });

  it("同期位置がないときは通常表示として扱う", () => {
    expect(isArchiveReplayThread(null, "tab-replay", position.threadUrl)).toBe(false);
  });
});

describe("過去実況スレッドの操作ポリシー", () => {
  it("一致する再生スレッドでは閲覧だけを許可する", () => {
    expect(getArchiveReplayThreadCapabilities(position, "tab-replay", position.threadUrl)).toEqual({
      isReadOnly: true,
      canRefresh: false,
      canAutoRefresh: false,
      canAutoAdvance: false,
      canWrite: false,
      canControlLiveOverlay: false,
      canShowMomentum: false,
    });
  });

  it("通常のスレッドでは既存の操作を許可する", () => {
    expect(getArchiveReplayThreadCapabilities(position, "tab-normal", position.threadUrl)).toEqual({
      isReadOnly: false,
      canRefresh: true,
      canAutoRefresh: true,
      canAutoAdvance: true,
      canWrite: true,
      canControlLiveOverlay: true,
      canShowMomentum: true,
    });
  });
});
