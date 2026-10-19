import {
  consumePendingThreadResJump,
  peekPendingThreadResJump,
  requestThreadResJump,
} from "src/view/browser/utils/thread-read-state";
import { afterEach, describe, expect, it } from "vite-plus/test";

describe("thread-read-state", () => {
  afterEach(() => {
    consumePendingThreadResJump("https://example.com/test/read.cgi/live/1/");
  });

  it("pending jumpを保持して後で消費できる", () => {
    const jump = requestThreadResJump("https://example.com/test/read.cgi/live/1/", 42);

    expect(jump?.resNum).toBe(42);
    expect(peekPendingThreadResJump("https://example.com/test/read.cgi/live/1/")).toMatchObject({
      resNum: 42,
    });
    expect(
      consumePendingThreadResJump("https://example.com/test/read.cgi/live/1/", jump?.token),
    ).toMatchObject({ resNum: 42 });
    expect(peekPendingThreadResJump("https://example.com/test/read.cgi/live/1/")).toBeNull();
  });
});
