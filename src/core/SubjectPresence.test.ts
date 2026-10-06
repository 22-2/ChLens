// @vitest-environment node
import {
  resetForcedSubjectCheckHistory,
  shouldForceSubjectCheck,
  SUBJECT_FORCE_CHECK_INTERVAL_MS,
} from "src/core/SubjectPresence";
import { beforeEach, describe, expect, it } from "vite-plus/test";

const threadUrl = "https://example.com/test/read.cgi/board/1000000000/";

describe("shouldForceSubjectCheck", () => {
  beforeEach(() => {
    resetForcedSubjectCheckHistory();
  });

  it("通常表示ではsubject.txtを強制取得しない", () => {
    expect(
      shouldForceSubjectCheck({
        threadUrl,
        forceUpdate: false,
        throttle: true,
        hasNewResponses: false,
        now: 0,
      }),
    ).toBe(false);
  });

  it("新着レスがある更新ではsubject.txtを強制取得しない", () => {
    expect(
      shouldForceSubjectCheck({
        threadUrl,
        forceUpdate: true,
        throttle: true,
        hasNewResponses: true,
        now: 0,
      }),
    ).toBe(false);
  });

  it("新着なしの更新は間隔内で1回だけ強制取得する", () => {
    const check = (now: number) =>
      shouldForceSubjectCheck({
        threadUrl,
        forceUpdate: true,
        throttle: true,
        hasNewResponses: false,
        now,
      });

    expect(check(0)).toBe(true);
    expect(check(SUBJECT_FORCE_CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(check(SUBJECT_FORCE_CHECK_INTERVAL_MS)).toBe(true);
  });

  it("手動更新は新着や間隔に関係なく強制取得し、自動更新の間隔を起点し直す", () => {
    const auto = (now: number) =>
      shouldForceSubjectCheck({
        threadUrl,
        forceUpdate: true,
        throttle: true,
        hasNewResponses: false,
        now,
      });
    const manual = (now: number) =>
      shouldForceSubjectCheck({
        threadUrl,
        forceUpdate: true,
        throttle: false,
        hasNewResponses: true,
        now,
      });

    expect(auto(0)).toBe(true);
    expect(manual(10)).toBe(true);
    expect(manual(20)).toBe(true);
    expect(auto(SUBJECT_FORCE_CHECK_INTERVAL_MS)).toBe(false);
    expect(auto(20 + SUBJECT_FORCE_CHECK_INTERVAL_MS)).toBe(true);
  });

  it("確認間隔はスレごとに独立して管理する", () => {
    expect(
      shouldForceSubjectCheck({
        threadUrl,
        forceUpdate: true,
        throttle: true,
        hasNewResponses: false,
        now: 0,
      }),
    ).toBe(true);
    expect(
      shouldForceSubjectCheck({
        threadUrl: "https://example.com/test/read.cgi/board/2000000000/",
        forceUpdate: true,
        throttle: true,
        hasNewResponses: false,
        now: 1,
      }),
    ).toBe(true);
  });
});
