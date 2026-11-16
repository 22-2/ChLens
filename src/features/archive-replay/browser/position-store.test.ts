import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import {
  type ArchiveReplayPosition,
  getArchiveReplayThreadCapabilities,
  isArchiveReplayThread,
  useArchiveReplayResponseFilter,
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

it("ライブ再現は時刻でレスを出し分け、バー表示では全レスを表示する", () => {
  const live = { ...position, followMode: "live" as const };
  const { result, rerender } = renderHook(
    ({ current }) => useArchiveReplayResponseFilter(current, true),
    { initialProps: { current: live as ArchiveReplayPosition } },
  );
  const earlier = { num: 1, date: "2026/10/02(金) 12:00:59" };
  const later = { num: 2, date: "2026/10/02(金) 12:01:01" };
  expect(result.current?.(earlier)).toBe(true);
  expect(result.current?.(later)).toBe(false);
  rerender({ current: { ...live, playbackAt: live.playbackAt! + 2000 } });
  expect(result.current?.(later)).toBe(true);
  rerender({ current: { ...live, followMode: "position" } });
  expect(result.current).toBeUndefined();
});

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
