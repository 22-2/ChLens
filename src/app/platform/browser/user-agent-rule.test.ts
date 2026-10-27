import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const dnr = vi.hoisted(() => ({
  getSessionRules: vi.fn(),
  updateSessionRules: vi.fn(),
}));
vi.mock("webextension-polyfill", () => ({ default: { declarativeNetRequest: dnr } }));

describe("applyUserAgentRule", () => {
  beforeEach(() => {
    vi.resetModules();
    dnr.getSessionRules.mockReset().mockResolvedValue([]);
    dnr.updateSessionRules.mockReset().mockResolvedValue(undefined);
  });

  it("取得先ホストだけにUser-Agentを差し替えるルールを追加し、同じ値なら再登録しない", async () => {
    const { applyUserAgentRule } = await import("src/app/platform/browser/user-agent-rule");
    await applyUserAgentRule("https://example.com/test/subject.txt", "Custom/1.0");
    await applyUserAgentRule("https://example.com/test/dat/1.dat", "Custom/1.0");

    expect(dnr.updateSessionRules).toHaveBeenCalledTimes(1);
    const rule = dnr.updateSessionRules.mock.calls[0]![0].addRules[0];
    expect(rule.action.requestHeaders).toEqual([
      { header: "User-Agent", operation: "set", value: "Custom/1.0" },
    ]);
    expect(rule.condition).toMatchObject({
      requestDomains: ["example.com"],
      resourceTypes: ["xmlhttprequest"],
      tabIds: [-1],
    });
  });

  it("値が変わったら同じIDのルールを置き換える", async () => {
    const { applyUserAgentRule } = await import("src/app/platform/browser/user-agent-rule");
    await applyUserAgentRule("https://example.com/", "A/1");
    await applyUserAgentRule("https://example.com/", "B/2");

    const [, second] = dnr.updateSessionRules.mock.calls;
    const firstId = dnr.updateSessionRules.mock.calls[0]![0].addRules[0].id;
    expect(second![0].removeRuleIds).toEqual([firstId]);
    expect(second![0].addRules[0].id).toBe(firstId);
  });

  it("空文字に戻したらルールを外す", async () => {
    const { applyUserAgentRule } = await import("src/app/platform/browser/user-agent-rule");
    await applyUserAgentRule("https://example.com/", "A/1");
    const id = dnr.updateSessionRules.mock.calls[0]![0].addRules[0].id;
    await applyUserAgentRule("https://example.com/", "");

    expect(dnr.updateSessionRules).toHaveBeenLastCalledWith({ removeRuleIds: [id] });
  });

  it("再起動後は残っているルールを読み直して重複登録しない", async () => {
    dnr.getSessionRules.mockResolvedValue([
      {
        id: 100_000,
        priority: 2,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "User-Agent", operation: "set", value: "A/1" }],
        },
        condition: { requestDomains: ["example.com"] },
      },
    ]);
    const { applyUserAgentRule } = await import("src/app/platform/browser/user-agent-rule");
    await applyUserAgentRule("https://example.com/", "A/1");

    expect(dnr.updateSessionRules).not.toHaveBeenCalled();
  });
});
