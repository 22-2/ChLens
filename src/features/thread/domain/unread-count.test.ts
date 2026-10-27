// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { countUnreadResponses } from "./unread-count";

describe("未読レス数", () => {
  it("既読位置がなければ数えない", () => {
    expect(countUnreadResponses(10, null)).toBeNull();
    expect(countUnreadResponses(10, undefined)).toBeNull();
  });

  it("手元のレス数と受信済みの多い方から既読数を引く", () => {
    expect(countUnreadResponses(10, { read: 4, received: 8 })).toBe(6);
    expect(countUnreadResponses(5, { read: 4, received: 8 })).toBe(4);
  });

  it("既読数が上回っても負にしない", () => {
    expect(countUnreadResponses(3, { read: 5, received: 3 })).toBe(0);
  });
});
