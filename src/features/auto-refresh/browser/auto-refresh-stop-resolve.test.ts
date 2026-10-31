import { resolveThreadAutoRefreshStop } from "src/features/auto-refresh/browser/auto-refresh-stop";
import { describe, expect, it } from "vite-plus/test";

const DAT_OCHI_MESSAGE = "dat落ちを検知したため自動更新を停止しました";
const LIMIT_MESSAGE = "1000レスに到達したため自動更新を停止しました";

function resolve(overrides: Partial<Parameters<typeof resolveThreadAutoRefreshStop>[0]> = {}) {
  return resolveThreadAutoRefreshStop({
    autoNextThreadEnabled: false,
    responseCount: 10,
    expired: false,
    missingFromSubject: false,
    stopped: false,
    ...overrides,
  });
}

describe("スレッドの自動更新の停止判定", () => {
  it("dat落ちも停止記録もなく、レス数が上限に達していなければ、止めない", () => {
    const result = resolve({ responseCount: 999 });

    expect(result.autoRefreshExpired).toBe(false);
    expect(result.hasReachedThreadLimit).toBe(false);
    expect(result.shouldStopFetching).toBe(false);
  });

  it("dat落ちになると、取得を止め、dat落ちの理由で停止する", () => {
    const result = resolve({ expired: true });

    expect(result.autoRefreshExpired).toBe(true);
    expect(result.shouldStopFetching).toBe(true);
    expect(result.stopMessage).toBe(DAT_OCHI_MESSAGE);
  });

  it("subject.txt から消えたスレッドは、dat落ちと同じ扱いで停止する", () => {
    const result = resolve({ missingFromSubject: true });

    expect(result.autoRefreshExpired).toBe(true);
    expect(result.shouldStopFetching).toBe(true);
    expect(result.stopMessage).toBe(DAT_OCHI_MESSAGE);
  });

  it("保存された停止記録だけでも、本文の取得を止める（再マウント後も停止を保つため）", () => {
    const result = resolve({ stopped: true });

    expect(result.autoRefreshExpired).toBe(true);
    expect(result.shouldStopFetching).toBe(true);
    expect(result.stopMessage).toBe(DAT_OCHI_MESSAGE);
  });

  it("1000レスに達したら、dat落ちでなくても取得を止め、上限の理由で停止する", () => {
    const result = resolve({ responseCount: 1000 });

    expect(result.hasReachedThreadLimit).toBe(true);
    expect(result.autoRefreshExpired).toBe(false);
    expect(result.shouldStopFetching).toBe(true);
    expect(result.stopMessage).toBe(LIMIT_MESSAGE);
  });

  it("次スレ移動がOFFなら、dat落ちでも停止を保留しない", () => {
    const result = resolve({ expired: true, autoNextThreadEnabled: false });

    expect(result.shouldDeferNextThreadStop).toBe(false);
  });

  it("停止記録が付いたスレッドは、次スレ移動がONでも停止を保留しない", () => {
    const result = resolve({ expired: true, stopped: true, autoNextThreadEnabled: true });

    expect(result.shouldDeferNextThreadStop).toBe(false);
  });
});
