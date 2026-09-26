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
    });

    expect(context.scope).toEqual({ responseNumbers: [2], participantIds: [] });
    expect(context.responses.map((response) => response.num)).toEqual([1, 2, 3, 4, 5]);
    expect(context.responses.find((response) => response.num === 2)?.role).toBe("target");
    expect(context.responses.find((response) => response.num === 1)?.role).toBe("context");
    expect(context.omittedResponses).toBe(0);
    expect(context.toon).toContain("contextDepth: 8");
    expect(context.toon).toContain("debate");
  });

  it("参加者IDを指定すると該当レスをすべて中心にする", () => {
    const context = buildDebateContext(THREAD, {
      participantIds: ["ID:BBB"],
    });

    expect(context.scope).toEqual({ responseNumbers: [2, 5], participantIds: ["BBB"] });
    expect(context.responses.map((response) => response.num)).toEqual([1, 2, 3, 4, 5]);
    expect(
      context.responses
        .filter((response) => response.role === "target")
        .map((response) => response.num),
    ).toEqual([2, 5]);
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
  research: [],
  simpleView: {
    topic: "根拠の有無",
    blue: {
      label: "根拠を示す側",
      participants: ["AAA"],
      claims: ["根拠がある"],
      metrics: {
        logic: { score: 3, reason: "主張の筋道が通っている。" },
        reading: { score: 3, reason: "反論の趣旨を捉えている。" },
        evidence: { score: 4, reason: "具体例を挙げている。" },
      },
    },
    red: {
      label: "反論する側",
      participants: ["BBB"],
      claims: ["反例がある"],
      metrics: {
        logic: { score: 3, reason: "反論は一貫している。" },
        reading: { score: 3, reason: "相手の主張を捉えている。" },
        evidence: { score: 2, reason: "裏付けは限定的。" },
      },
    },
    blueAdvantage: 0.58,
    verdictReason: "具体例を示した側が少し優勢。",
  },
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
