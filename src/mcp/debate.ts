import { encode } from "@toon-format/toon";

import type { ThreadReadMode } from "./protocol.ts";

const MAX_CONTEXT_RESPONSES = 240;
const MAX_CONTEXT_DEPTH = 8;
const MAX_RESULT_STRING_LENGTH = 200_000;

export type DebateIssueStatus = "resolved" | "mixed" | "unresolved" | "insufficient-evidence";

export type DebateEvidenceRole = "support" | "challenge" | "context";

export interface DebatePrepareParams {
  url?: string;
  mode?: ThreadReadMode;
  responseNumbers?: number[];
  participantIds?: string[];
  maxResponses?: number;
  contextDepth?: number;
}

export interface DebateContextResponse {
  num: number;
  id: string;
  date: string;
  message: string;
  role: "target" | "context";
  distance: number;
  replyTo: number[];
  repliedBy: number[];
}

export interface DebateContext {
  kind: "debate-context";
  thread: {
    title: string;
    url: string;
    totalResponses: number;
  };
  scope: {
    responseNumbers: number[];
    participantIds: string[];
  };
  responses: DebateContextResponse[];
  omittedResponses: number;
  instructions: string;
  resultSchema: typeof DEBATE_RESULT_SCHEMA;
  toon: string;
}

export interface DebateEvidence {
  responseNumbers: number[];
  role: DebateEvidenceRole;
  note: string;
}

export interface DebatePosition {
  participantIds: string[];
  claim: string;
  evidence: DebateEvidence[];
}

export interface DebateIssue {
  id: string;
  topic: string;
  status: DebateIssueStatus;
  conclusion: string;
  positions: DebatePosition[];
  evidence: DebateEvidence[];
}

export interface DebateParticipantScore {
  logic: number;
  reading: number;
  evidence: number;
}

export interface DebateParticipant {
  id: string;
  responseNumbers: number[];
  position: string;
  strengths: string[];
  weaknesses: string[];
  score?: DebateParticipantScore;
}

export interface DebateResult {
  schemaVersion: 1;
  thread: {
    title: string;
    url: string;
    analyzedAt?: string;
  };
  scope: {
    responseNumbers: number[];
    participantIds: string[];
  };
  summary: string;
  conclusion: string;
  issues: DebateIssue[];
  participants: DebateParticipant[];
  caveats?: string[];
}

export const DEBATE_RESULT_SCHEMA = {
  type: "object",
  required: ["schemaVersion", "thread", "scope", "summary", "conclusion", "issues", "participants"],
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    thread: {
      type: "object",
      required: ["title", "url"],
      properties: {
        title: { type: "string" },
        url: { type: "string" },
        analyzedAt: { type: "string" },
      },
    },
    scope: {
      type: "object",
      required: ["responseNumbers", "participantIds"],
      properties: {
        responseNumbers: { type: "array", items: { type: "integer", minimum: 1 } },
        participantIds: { type: "array", items: { type: "string" } },
      },
    },
    summary: { type: "string" },
    conclusion: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "topic", "status", "conclusion", "positions", "evidence"],
        properties: {
          id: { type: "string" },
          topic: { type: "string" },
          status: {
            type: "string",
            enum: ["resolved", "mixed", "unresolved", "insufficient-evidence"],
          },
          conclusion: { type: "string" },
          positions: { type: "array", items: { type: "object" } },
          evidence: { type: "array", items: { type: "object" } },
        },
      },
    },
    participants: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "responseNumbers", "position", "strengths", "weaknesses"],
        properties: {
          id: { type: "string" },
          responseNumbers: { type: "array", items: { type: "integer", minimum: 1 } },
          position: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          score: {
            type: "object",
            required: ["logic", "reading", "evidence"],
            properties: {
              logic: { type: "number", minimum: 0, maximum: 5 },
              reading: { type: "number", minimum: 0, maximum: 5 },
              evidence: { type: "number", minimum: 0, maximum: 5 },
            },
          },
        },
      },
    },
    caveats: { type: "array", items: { type: "string" } },
  },
} as const;

const ANALYSIS_INSTRUCTIONS =
  "JSONのみで回答する。固定の二陣営に押し込めず、争点ごとに主張・反論・結論を整理する。" +
  "侮辱や煽りは論拠として扱わず、外部事実を確認していない場合は断定せず、根拠レスと不確実性を明記する。";

interface DecodedThreadResponse {
  num: number;
  id?: string;
  date?: string;
  message?: string;
  replyTo?: string;
  repliedBy?: string;
}

interface DecodedThreadPayload {
  thread?: {
    title?: string;
    url?: string;
    totalResponses?: number;
  };
  responses?: DecodedThreadResponse[];
}

interface NormalizedResponse extends DecodedThreadResponse {
  num: number;
  id: string;
  date: string;
  message: string;
  replyToNumbers: number[];
  repliedByNumbers: number[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeParticipantId(value: string): string {
  return value.trim().replace(/^ID:/i, "");
}

function parseRelationNumbers(value: string | undefined): number[] {
  if (!value) return [];
  return [...value.matchAll(/\d+/g)]
    .map((match) => Number(match[0]))
    .filter((num) => Number.isInteger(num) && num > 0);
}

function normalizeResponse(value: unknown): NormalizedResponse | null {
  if (!isObject(value)) return null;
  const num = asPositiveInteger(value.num);
  if (num == null) return null;
  const raw = value as unknown as DecodedThreadResponse;
  return {
    ...raw,
    num,
    id: normalizeParticipantId(asString(raw.id)),
    date: asString(raw.date),
    message: asString(raw.message),
    replyToNumbers: parseRelationNumbers(asString(raw.replyTo)),
    repliedByNumbers: parseRelationNumbers(asString(raw.repliedBy)),
  };
}

function normalizeThreadPayload(value: unknown): {
  title: string;
  url: string;
  totalResponses: number;
  responses: NormalizedResponse[];
} {
  if (!isObject(value)) throw new Error("ChLensのスレッド応答を解釈できません");
  const raw = value as DecodedThreadPayload;
  if (!isObject(raw.thread) || !Array.isArray(raw.responses)) {
    throw new Error("ChLensのスレッド応答にthreadまたはresponsesがありません");
  }
  const responses = raw.responses
    .map(normalizeResponse)
    .filter((response): response is NormalizedResponse => response != null)
    .sort((left, right) => left.num - right.num);
  return {
    title: asString(raw.thread.title),
    url: asString(raw.thread.url),
    totalResponses: asPositiveInteger(raw.thread.totalResponses) ?? responses.length,
    responses,
  };
}

function uniquePositiveIntegers(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(values.map(asPositiveInteger).filter((value): value is number => value != null)),
  ];
}

function uniqueParticipantIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map(normalizeParticipantId)
        .filter(Boolean),
    ),
  ];
}

function resolveScope(
  responses: readonly NormalizedResponse[],
  params: DebatePrepareParams,
): { responseNumbers: number[]; participantIds: string[] } {
  const available = new Set(responses.map((response) => response.num));
  const responseNumbers = uniquePositiveIntegers(params.responseNumbers).filter((num) =>
    available.has(num),
  );
  const requestedIds = uniqueParticipantIds(params.participantIds);
  const participantIds = requestedIds.filter((id) =>
    responses.some((response) => response.id === id),
  );
  const idResponseNumbers = responses
    .filter((response) => participantIds.includes(response.id))
    .map((response) => response.num);
  const targets = [...new Set([...responseNumbers, ...idResponseNumbers])].sort(
    (left, right) => left - right,
  );
  if (targets.length === 0) {
    throw new Error("存在するレス番号またはIDを少なくとも1つ指定してください");
  }
  return { responseNumbers: targets, participantIds };
}

function buildContextNumbers(
  responses: readonly NormalizedResponse[],
  targets: readonly number[],
  contextDepth: number,
): Map<number, number> {
  // 変更理由: 返信関係の正本は既存のthread-outputがreply-indexからTOON化しているため、
  // MCP側では同じメタデータを使ってDOMや別のツリー実装に依存せず周辺レスを辿る。
  const responseMap = new Map(responses.map((response) => [response.num, response]));
  const distances = new Map<number, number>();
  const queue = targets.map((num) => ({ num, distance: 0 }));
  for (const target of targets) distances.set(target, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.distance >= contextDepth) continue;
    const response = responseMap.get(current.num);
    if (!response) continue;
    const neighbors = [...response.replyToNumbers, ...response.repliedByNumbers];
    for (const neighbor of neighbors) {
      if (!responseMap.has(neighbor) || distances.has(neighbor)) continue;
      distances.set(neighbor, current.distance + 1);
      queue.push({ num: neighbor, distance: current.distance + 1 });
    }
  }
  return distances;
}

export function buildDebateContext(value: unknown, params: DebatePrepareParams): DebateContext {
  const thread = normalizeThreadPayload(value);
  const scope = resolveScope(thread.responses, params);
  const contextDepth = Math.min(asNonNegativeInteger(params.contextDepth) ?? 4, MAX_CONTEXT_DEPTH);
  const distances = buildContextNumbers(thread.responses, scope.responseNumbers, contextDepth);
  const ordered = [...distances.entries()]
    .sort((left, right) => left[1] - right[1] || left[0] - right[0])
    .slice(
      0,
      Math.min(
        asPositiveInteger(params.maxResponses) ?? MAX_CONTEXT_RESPONSES,
        MAX_CONTEXT_RESPONSES,
      ),
    );
  const responseMap = new Map(thread.responses.map((response) => [response.num, response]));
  const targetSet = new Set(scope.responseNumbers);
  const responses = ordered
    .map(([num, distance]) => {
      const response = responseMap.get(num);
      if (!response) return null;
      return {
        num: response.num,
        id: response.id,
        date: response.date,
        message: response.message,
        role: targetSet.has(response.num) ? ("target" as const) : ("context" as const),
        distance,
        replyTo: response.replyToNumbers.filter((target) => responseMap.has(target)),
        repliedBy: response.repliedByNumbers.filter((target) => responseMap.has(target)),
      };
    })
    .filter((response): response is DebateContextResponse => response != null)
    .sort((left, right) => left.num - right.num);
  const omittedResponses = Math.max(thread.responses.length - responses.length, 0);
  const contextData = {
    debate: {
      kind: "debate-context",
      thread: {
        title: thread.title,
        url: thread.url,
        totalResponses: thread.totalResponses,
      },
      scope,
      responseCount: responses.length,
      omittedResponses,
      contextDepth,
      instructions: ANALYSIS_INSTRUCTIONS,
      resultSchema: DEBATE_RESULT_SCHEMA,
    },
    responses,
  };
  return {
    kind: "debate-context",
    thread: {
      title: thread.title,
      url: thread.url,
      totalResponses: thread.totalResponses,
    },
    scope,
    responses,
    omittedResponses,
    instructions: ANALYSIS_INSTRUCTIONS,
    resultSchema: DEBATE_RESULT_SCHEMA,
    toon: encode(contextData),
  };
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path}は空でない文字列で指定してください`);
  }
  return value.trim();
}

function requireIntegerArray(value: unknown, path: string): number[] {
  if (!Array.isArray(value)) throw new Error(`${path}は配列で指定してください`);
  const result = uniquePositiveIntegers(value);
  if (result.length !== value.length) throw new Error(`${path}には正の整数だけを指定してください`);
  return result;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path}は配列で指定してください`);
  const result = uniqueParticipantIds(value);
  if (result.length !== value.length)
    throw new Error(`${path}には空でない文字列だけを指定してください`);
  return result;
}

function requireEvidence(value: unknown, path: string): DebateEvidence[] {
  if (!Array.isArray(value)) throw new Error(`${path}は配列で指定してください`);
  return value.map((item, index) => {
    if (!isObject(item)) throw new Error(`${path}[${index}]が不正です`);
    const role = item.role;
    if (role !== "support" && role !== "challenge" && role !== "context") {
      throw new Error(`${path}[${index}].roleが不正です`);
    }
    return {
      responseNumbers: requireIntegerArray(
        item.responseNumbers,
        `${path}[${index}].responseNumbers`,
      ),
      role,
      note: requireString(item.note, `${path}[${index}].note`),
    };
  });
}

function requirePositions(value: unknown, path: string): DebatePosition[] {
  if (!Array.isArray(value)) throw new Error(`${path}は配列で指定してください`);
  return value.map((item, index) => {
    if (!isObject(item)) throw new Error(`${path}[${index}]が不正です`);
    return {
      participantIds: requireStringArray(item.participantIds, `${path}[${index}].participantIds`),
      claim: requireString(item.claim, `${path}[${index}].claim`),
      evidence: requireEvidence(item.evidence, `${path}[${index}].evidence`),
    };
  });
}

function requireScore(value: unknown, path: string): DebateParticipantScore {
  if (!isObject(value)) throw new Error(`${path}が不正です`);
  const score = {
    logic: value.logic,
    reading: value.reading,
    evidence: value.evidence,
  };
  for (const [name, item] of Object.entries(score)) {
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 5) {
      throw new Error(`${path}.${name}は0から5の数値で指定してください`);
    }
  }
  return score as DebateParticipantScore;
}

export function validateDebateResult(value: unknown): DebateResult {
  if (!isObject(value)) throw new Error("判定結果はJSONオブジェクトで指定してください");
  if (value.schemaVersion !== 1) throw new Error("schemaVersionは1を指定してください");
  if (!isObject(value.thread)) throw new Error("threadが不正です");
  if (!isObject(value.scope)) throw new Error("scopeが不正です");
  const thread = {
    title: requireString(value.thread.title, "thread.title"),
    url: requireString(value.thread.url, "thread.url"),
    ...(value.thread.analyzedAt == null
      ? {}
      : { analyzedAt: requireString(value.thread.analyzedAt, "thread.analyzedAt") }),
  };
  const issuesValue = value.issues;
  if (!Array.isArray(issuesValue)) throw new Error("issuesは配列で指定してください");
  const issues = issuesValue.map((item, index) => {
    if (!isObject(item)) throw new Error(`issues[${index}]が不正です`);
    const status: DebateIssueStatus = item.status as DebateIssueStatus;
    if (
      status !== "resolved" &&
      status !== "mixed" &&
      status !== "unresolved" &&
      status !== "insufficient-evidence"
    ) {
      throw new Error(`issues[${index}].statusが不正です`);
    }
    return {
      id: requireString(item.id, `issues[${index}].id`),
      topic: requireString(item.topic, `issues[${index}].topic`),
      status,
      conclusion: requireString(item.conclusion, `issues[${index}].conclusion`),
      positions: requirePositions(item.positions, `issues[${index}].positions`),
      evidence: requireEvidence(item.evidence, `issues[${index}].evidence`),
    };
  });
  if (!Array.isArray(value.participants)) throw new Error("participantsは配列で指定してください");
  const participants = value.participants.map((item, index) => {
    if (!isObject(item)) throw new Error(`participants[${index}]が不正です`);
    return {
      id: requireString(item.id, `participants[${index}].id`),
      responseNumbers: requireIntegerArray(
        item.responseNumbers,
        `participants[${index}].responseNumbers`,
      ),
      position: requireString(item.position, `participants[${index}].position`),
      strengths: requireStringArray(item.strengths, `participants[${index}].strengths`),
      weaknesses: requireStringArray(item.weaknesses, `participants[${index}].weaknesses`),
      ...(item.score == null
        ? {}
        : { score: requireScore(item.score, `participants[${index}].score`) }),
    };
  });
  const result: DebateResult = {
    schemaVersion: 1,
    thread,
    scope: {
      responseNumbers: requireIntegerArray(value.scope.responseNumbers, "scope.responseNumbers"),
      participantIds: requireStringArray(value.scope.participantIds, "scope.participantIds"),
    },
    summary: requireString(value.summary, "summary"),
    conclusion: requireString(value.conclusion, "conclusion"),
    issues,
    participants,
    ...(value.caveats == null ? {} : { caveats: requireStringArray(value.caveats, "caveats") }),
  };
  if (JSON.stringify(result).length > MAX_RESULT_STRING_LENGTH) {
    throw new Error("判定結果が大きすぎます");
  }
  return result;
}

function responseLink(url: string, num: number): string {
  return `${url.replace(/\/+$/, "")}/${num}`;
}

function formatScore(score: DebateParticipantScore | undefined): string {
  if (!score) return "採点なし";
  return `論理 ${score.logic.toFixed(1)} / 読解 ${score.reading.toFixed(1)} / 根拠 ${score.evidence.toFixed(1)}`;
}

export function formatDebateText(result: DebateResult): string {
  const lines = [
    `議論判定: ${result.thread.title}`,
    `スレッド: ${result.thread.url}`,
    "",
    `要約: ${result.summary}`,
    `結論: ${result.conclusion}`,
    "",
    "争点別判定:",
  ];
  for (const issue of result.issues) {
    lines.push(`- ${issue.topic} [${issue.status}] ${issue.conclusion}`);
    for (const position of issue.positions) {
      lines.push(`  - ${position.participantIds.join(", ") || "参加者不明"}: ${position.claim}`);
    }
  }
  lines.push("", "参加者別評価:");
  for (const participant of result.participants) {
    lines.push(`- ${participant.id}: ${participant.position} (${formatScore(participant.score)})`);
    if (participant.strengths.length > 0)
      lines.push(`  - 有効点: ${participant.strengths.join(" / ")}`);
    if (participant.weaknesses.length > 0)
      lines.push(`  - 弱点: ${participant.weaknesses.join(" / ")}`);
  }
  if (result.caveats && result.caveats.length > 0) {
    lines.push("", "留意点:", ...result.caveats.map((caveat) => `- ${caveat}`));
  }
  return lines.join("\n");
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!|>~-]/g, "\\$&");
}

export function formatDebateMarkdown(result: DebateResult): string {
  const lines = [
    `# 議論判定: ${escapeMarkdown(result.thread.title)}`,
    "",
    `- スレッド: [開く](${result.thread.url})`,
    `- 判定形式: 争点別判定`,
    "",
    "## 要約",
    "",
    result.summary,
    "",
    "## 結論",
    "",
    result.conclusion,
    "",
    "## 争点別判定",
    "",
  ];
  for (const issue of result.issues) {
    lines.push(`### ${escapeMarkdown(issue.topic)}（${issue.status}）`, "", issue.conclusion, "");
    for (const position of issue.positions) {
      lines.push(
        `- **${escapeMarkdown(position.participantIds.join(", ") || "参加者不明")}**: ${position.claim}`,
      );
      for (const evidence of position.evidence) {
        lines.push(
          `  - ${evidence.role}: ${evidence.note} ` +
            evidence.responseNumbers
              .map((num) => `[レス${num}](${responseLink(result.thread.url, num)})`)
              .join(", "),
        );
      }
    }
    for (const evidence of issue.evidence) {
      lines.push(
        `- 根拠（${evidence.role}）: ${evidence.note} ` +
          evidence.responseNumbers
            .map((num) => `[レス${num}](${responseLink(result.thread.url, num)})`)
            .join(", "),
      );
    }
    lines.push("");
  }
  lines.push("## 参加者別評価", "");
  for (const participant of result.participants) {
    lines.push(`### ${escapeMarkdown(participant.id)}`, "", participant.position, "");
    lines.push(
      `- 対象レス: ${participant.responseNumbers.map((num) => `[${num}](${responseLink(result.thread.url, num)})`).join(", ")}`,
    );
    lines.push(`- 点数: ${formatScore(participant.score)}`);
    if (participant.strengths.length > 0)
      lines.push(`- 有効点: ${participant.strengths.join(" / ")}`);
    if (participant.weaknesses.length > 0)
      lines.push(`- 弱点: ${participant.weaknesses.join(" / ")}`);
    lines.push("");
  }
  if (result.caveats && result.caveats.length > 0) {
    lines.push("## 留意点", "", ...result.caveats.map((caveat) => `- ${caveat}`), "");
  }
  return lines.join("\n");
}
