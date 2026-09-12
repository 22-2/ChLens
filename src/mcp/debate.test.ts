import { describe, expect, it } from "vite-plus/test";

import {
  buildDebateContext,
  formatDebateMarkdown,
  formatDebateText,
  validateDebateResult,
} from "./debate.ts";

const THREAD = {
  thread: {
    title: "議論テスト",
    url: "https://example.com/test/read.cgi/board/1/",
    totalResponses: 5,
  },
  responses: [
    { num: 1, id: "AAA", date: "10:00", message: "最初の主張", replyTo: "", repliedBy: "2,3" },
    { num: 2, id: "BBB", date: "10:01", message: ">>1 反論", replyTo: "1", repliedBy: "4" },
    { num: 3, id: "AAA", date: "10:02", message: ">>1 補足", replyTo: "1", repliedBy: "" },
    { num: 4, id: "CCC", date: "10:03", message: ">>2 再反論", replyTo: "2", repliedBy: "5" },
    { num: 5, id: "BBB", date: "10:04", message: ">>4 返答", replyTo: "4", repliedBy: "" },
  ],
};

describe("議論判定コンテキスト", () => {
  it("中心レスから返信元と返信先を辿る", () => {
    const context = buildDebateContext(THREAD, {
      responseNumbers: [2],
      contextDepth: 2,
    });

    expect(context.scope).toEqual({ responseNumbers: [2], participantIds: [] });
    expect(context.responses.map((response) => response.num)).toEqual([1, 2, 3, 4, 5]);
    expect(context.responses.find((response) => response.num === 2)?.role).toBe("target");
    expect(context.responses.find((response) => response.num === 1)?.role).toBe("context");
    expect(context.omittedResponses).toBe(0);
    expect(context.toon).toContain("debate");
  });

  it("参加者IDを指定すると該当レスをすべて中心にする", () => {
    const context = buildDebateContext(THREAD, {
      participantIds: ["ID:BBB"],
      contextDepth: 0,
    });

    expect(context.scope).toEqual({ responseNumbers: [2, 5], participantIds: ["BBB"] });
    expect(context.responses.map((response) => response.num)).toEqual([2, 5]);
    expect(context.responses.every((response) => response.role === "target")).toBe(true);
  });
});

const RESULT = {
  schemaVersion: 1,
  thread: { title: "議論テスト", url: "https://example.com/test/read.cgi/board/1/" },
  scope: { responseNumbers: [1, 2], participantIds: ["AAA", "BBB"] },
  summary: "二つの主張が対立している。",
  conclusion: "根拠が示された側に分がある。",
  issues: [
    {
      id: "issue-1",
      topic: "根拠の有無",
      status: "mixed",
      conclusion: "一部のみ確認できる。",
      positions: [
        {
          participantIds: ["AAA"],
          claim: "根拠がある",
          evidence: [{ responseNumbers: [1], role: "support", note: "具体例" }],
        },
      ],
      evidence: [{ responseNumbers: [2], role: "challenge", note: "反例" }],
    },
  ],
  participants: [
    {
      id: "AAA",
      responseNumbers: [1],
      position: "根拠を提示する側",
      strengths: ["具体例"],
      weaknesses: ["反例への応答がない"],
      score: { logic: 3.5, reading: 3, evidence: 4 },
    },
  ],
};

describe("議論判定結果", () => {
  it("結果を検証し、テキストとMarkdownにレスリンクを含める", () => {
    const result = validateDebateResult(RESULT);
    expect(formatDebateText(result)).toContain("根拠の有無");
    expect(formatDebateMarkdown(result)).toContain("https://example.com/test/read.cgi/board/1/1");
  });

  it("必須フィールドがない結果を拒否する", () => {
    expect(() => validateDebateResult({ ...RESULT, conclusion: "" })).toThrow("conclusion");
  });
});
