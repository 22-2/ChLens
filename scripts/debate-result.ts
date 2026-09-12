import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Resvg } from "@resvg/resvg-js";
import type { ReactNode } from "react";
import satori from "satori";

import {
  type DebateIssue,
  type DebateParticipant,
  type DebateResult,
  formatDebateMarkdown,
  formatDebateText,
} from "../src/mcp/debate.ts";

export type DebateOutputFormat = "json" | "markdown" | "text" | "svg" | "png";

export interface SavedDebateFile {
  format: DebateOutputFormat;
  path: string;
}

export interface SavedDebateResult {
  directory: string;
  files: SavedDebateFile[];
}

const DEFAULT_FORMATS: DebateOutputFormat[] = ["json", "markdown", "text", "svg", "png"];
const MAX_RENDER_TEXT_LENGTH = 420;
const CARD_WIDTH = 1200;

interface ParticipantTone {
  fill: string;
  stroke: string;
  text: string;
}

// 変更理由: 画像上で参加者を同じ色で追跡できるようにし、争点の判定色と
// 参加者の識別色を分離する。これで「誰の主張か」と「判定状態」を混同しない。
const PARTICIPANT_TONES: ParticipantTone[] = [
  { fill: "#172554", stroke: "#60a5fa", text: "#bfdbfe" },
  { fill: "#4c1d2a", stroke: "#fb7185", text: "#fecdd3" },
  { fill: "#064e3b", stroke: "#34d399", text: "#a7f3d0" },
  { fill: "#3b0764", stroke: "#c084fc", text: "#e9d5ff" },
];

const ISSUE_STATUS_TONES: Record<
  DebateIssue["status"],
  { fill: string; stroke: string; text: string }
> = {
  resolved: { fill: "#052e16", stroke: "#4ade80", text: "#bbf7d0" },
  mixed: { fill: "#422006", stroke: "#fbbf24", text: "#fef3c7" },
  unresolved: { fill: "#450a0a", stroke: "#f87171", text: "#fecaca" },
  "insufficient-evidence": { fill: "#1e1b4b", stroke: "#a78bfa", text: "#ddd6fe" },
};

interface SatoriStyle {
  [key: string]: string | number | boolean | SatoriStyle | string[];
}

function node(type: string, children: ReactNode, style: SatoriStyle = {}): ReactNode {
  const resolvedStyle =
    type === "div" && Array.isArray(children) && children.length > 1 && style.display == null
      ? {
          // 変更理由: Satoriは複数の子を持つdivの表示方式を暗黙に決めないため、
          // 補助ノードでも常に縦積みとして描画できる既定値を与える。
          display: "flex",
          flexDirection: "column",
          ...style,
        }
      : style;
  return {
    type,
    props: { children, style: resolvedStyle },
  } as unknown as ReactNode;
}

function asText(value: string, limit = MAX_RENDER_TEXT_LENGTH): string {
  // 画像用テキストに制御文字を残すとSVGのレイアウトが崩れるため、改行以外を空白へ置換する。
  const normalized = Array.from(value, (char) => {
    const code = char.codePointAt(0) ?? 0;
    return code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d ? " " : char;
  })
    .join("")
    .trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function statusLabel(status: DebateIssue["status"]): string {
  switch (status) {
    case "resolved":
      return "整理できた";
    case "mixed":
      return "条件付き";
    case "unresolved":
      return "未決着";
    case "insufficient-evidence":
      return "根拠不足";
  }
}

function compactText(value: string, limit: number): string {
  return asText(value, limit).replace(/\s+/gu, " ").trim();
}

function participantIdsForResult(result: DebateResult): string[] {
  const ids = [
    ...result.participants.map((participant) => participant.id),
    ...result.scope.participantIds,
    ...result.issues.flatMap((issue) =>
      issue.positions.flatMap((position) => position.participantIds),
    ),
  ];
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function participantLabel(id: string, participantIds: readonly string[]): string {
  const index = participantIds.indexOf(id);
  return index >= 0 ? `参加者${String.fromCharCode(65 + index)}` : "参加者不明";
}

function participantTone(id: string, participantIds: readonly string[]): ParticipantTone {
  const index = Math.max(0, participantIds.indexOf(id));
  return PARTICIPANT_TONES[index % PARTICIPANT_TONES.length];
}

function issueStatusTone(status: DebateIssue["status"]) {
  return ISSUE_STATUS_TONES[status];
}

function overallVerdict(result: DebateResult): {
  label: string;
  detail: string;
  fill: string;
  stroke: string;
  text: string;
} {
  const statuses = result.issues.map((issue) => issue.status);
  if (statuses.length === 0) {
    return {
      label: "判定材料なし",
      detail: "争点が登録されていません",
      fill: "#1e293b",
      stroke: "#64748b",
      text: "#e2e8f0",
    };
  }
  if (statuses.every((status) => status === "resolved")) {
    return {
      label: "争点を整理",
      detail: "提示された範囲では大筋が一致",
      fill: "#052e16",
      stroke: "#4ade80",
      text: "#bbf7d0",
    };
  }
  if (statuses.some((status) => status === "unresolved")) {
    return {
      label: "未決着",
      detail: "重要な食い違いが残っています",
      fill: "#450a0a",
      stroke: "#f87171",
      text: "#fecaca",
    };
  }
  if (statuses.some((status) => status === "insufficient-evidence")) {
    return {
      label: "根拠不足",
      detail: "外部事実の確認が必要です",
      fill: "#1e1b4b",
      stroke: "#a78bfa",
      text: "#ddd6fe",
    };
  }
  return {
    label: "条件付き",
    detail: "条件をそろえると評価が変わります",
    fill: "#422006",
    stroke: "#fbbf24",
    text: "#fef3c7",
  };
}

function uniqueResponseNumbers(result: DebateResult): number[] {
  const values = [
    ...result.scope.responseNumbers,
    ...result.issues.flatMap((issue) => [
      ...issue.evidence.flatMap((evidence) => evidence.responseNumbers),
      ...issue.positions.flatMap((position) =>
        position.evidence.flatMap((evidence) => evidence.responseNumbers),
      ),
    ]),
  ].filter((value) => Number.isInteger(value) && value > 0);
  return [...new Set(values)].sort((left, right) => left - right);
}

function timelineSteps(result: DebateResult): Array<{ number: number; label: string }> {
  const numbers = uniqueResponseNumbers(result);
  if (numbers.length === 0) return [];
  const indexes = [
    0,
    Math.round((numbers.length - 1) / 3),
    Math.round(((numbers.length - 1) * 2) / 3),
    numbers.length - 1,
  ];
  const uniqueIndexes = [...new Set(indexes)].sort((left, right) => left - right);
  const labels = ["起点", "反論", "整理", "着地点"];
  return uniqueIndexes.map((index, step) => ({
    number: numbers[index],
    label: labels[step] ?? "転換点",
  }));
}

function refsLabel(values: readonly number[], limit = 3): string {
  const refs = [...new Set(values)].filter((value) => Number.isInteger(value) && value > 0);
  if (refs.length === 0) return "レス番号なし";
  const shown = refs
    .slice(0, limit)
    .map((number) => `#${number}`)
    .join(" ");
  return refs.length > limit ? `${shown} …` : shown;
}

function positionForParticipant(issue: DebateIssue, id: string) {
  return issue.positions.find((position) => position.participantIds.includes(id));
}

function scoreMeter(label: string, value: number): ReactNode {
  const percentage = Math.max(0, Math.min(100, Math.round((value / 5) * 100)));
  return node(
    "div",
    [
      node("div", `${label} ${value.toFixed(1)}`, { color: "#cbd5e1", fontSize: 14 }),
      node(
        "div",
        node("div", null, {
          width: `${percentage}%`,
          height: 6,
          backgroundColor: "#67e8f9",
          borderRadius: 3,
        }),
        {
          display: "flex",
          height: 6,
          backgroundColor: "#334155",
          borderRadius: 3,
          marginTop: 4,
        },
      ),
    ],
    { display: "flex", flexDirection: "column", width: "31%" },
  );
}

function issuePositionNode(
  issue: DebateIssue,
  id: string,
  participantIds: readonly string[],
): ReactNode {
  const tone = participantTone(id, participantIds);
  const position = positionForParticipant(issue, id);
  const refs = position?.evidence.flatMap((evidence) => evidence.responseNumbers) ?? [];
  return node(
    "div",
    [
      node("div", participantLabel(id, participantIds), {
        color: tone.text,
        fontSize: 17,
        fontWeight: 700,
      }),
      node("div", id, { color: "#94a3b8", fontSize: 13, marginTop: 2 }),
      node("div", compactText(position?.claim ?? "この争点への主張は記載なし", 78), {
        color: "#f8fafc",
        fontSize: 18,
        lineHeight: 1.25,
        marginTop: 8,
      }),
      node("div", refsLabel(refs), { color: tone.text, fontSize: 13, marginTop: 8 }),
    ],
    {
      display: "flex",
      flexDirection: "column",
      width: "43%",
      minHeight: 112,
      backgroundColor: tone.fill,
      border: `2px solid ${tone.stroke}`,
      borderRadius: 12,
      padding: 14,
    },
  );
}

function compactIssueNode(issue: DebateIssue, participantIds: readonly string[]): ReactNode {
  const visibleIds = participantIds.slice(0, 2);
  const status = issueStatusTone(issue.status);
  const compareNodes = visibleIds.map((id) => issuePositionNode(issue, id, participantIds));
  const connector =
    compareNodes.length > 1
      ? node(
          "div",
          [
            node("div", "↔", { color: "#fef08a", fontSize: 30, fontWeight: 700 }),
            node("div", "論点", { color: "#fef08a", fontSize: 13, fontWeight: 700 }),
          ],
          {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "10%",
          },
        )
      : null;
  const evidenceRefs = issue.evidence.flatMap((evidence) => evidence.responseNumbers);
  return node(
    "div",
    [
      node(
        "div",
        [
          node("span", statusLabel(issue.status), {
            color: status.text,
            backgroundColor: status.fill,
            border: `1px solid ${status.stroke}`,
            borderRadius: 12,
            padding: "4px 10px",
            fontSize: 14,
            fontWeight: 700,
          }),
          node("span", compactText(issue.topic, 52), {
            color: "#f8fafc",
            fontSize: 22,
            fontWeight: 700,
            marginLeft: 10,
          }),
        ],
        { display: "flex", alignItems: "center" },
      ),
      node(
        "div",
        compareNodes.length > 1 && connector
          ? [compareNodes[0], connector, compareNodes[1]]
          : compareNodes,
        { display: "flex", alignItems: "stretch", justifyContent: "space-between", marginTop: 12 },
      ),
      node("div", `判定: ${compactText(issue.conclusion, 120)}`, {
        color: "#fef08a",
        fontSize: 16,
        lineHeight: 1.25,
        marginTop: 10,
      }),
      evidenceRefs.length > 0
        ? node("div", `根拠 ${refsLabel(evidenceRefs, 5)}`, {
            color: "#67e8f9",
            fontSize: 13,
            marginTop: 5,
          })
        : null,
    ].filter((child): child is ReactNode => child != null),
    {
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#111827",
      border: `1px solid ${status.stroke}`,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
    },
  );
}

function compactParticipantNode(
  participant: DebateParticipant,
  participantIds: readonly string[],
): ReactNode {
  const tone = participantTone(participant.id, participantIds);
  const score = participant.score;
  const meters = score
    ? [
        scoreMeter("論理", score.logic),
        scoreMeter("読解", score.reading),
        scoreMeter("根拠", score.evidence),
      ]
    : [node("div", "採点なし", { color: "#94a3b8", fontSize: 14 })];
  return node(
    "div",
    [
      node(
        "div",
        [
          node("div", null, {
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: tone.stroke,
            marginRight: 8,
          }),
          node("span", participantLabel(participant.id, participantIds), {
            color: tone.text,
            fontSize: 18,
            fontWeight: 700,
          }),
          node("span", participant.id, { color: "#94a3b8", fontSize: 13, marginLeft: 8 }),
        ],
        { display: "flex", alignItems: "center" },
      ),
      node("div", compactText(participant.position, 92), {
        color: "#f8fafc",
        fontSize: 16,
        lineHeight: 1.25,
        marginTop: 10,
      }),
      node("div", meters, { display: "flex", justifyContent: "space-between", marginTop: 12 }),
    ],
    {
      display: "flex",
      flexDirection: "column",
      width: "48%",
      backgroundColor: tone.fill,
      border: `1px solid ${tone.stroke}`,
      borderRadius: 12,
      padding: 14,
      marginRight: 12,
      marginBottom: 12,
    },
  );
}

function compactTimelineNode(result: DebateResult): ReactNode | null {
  const steps = timelineSteps(result);
  if (steps.length === 0) return null;
  const stepNodes = steps.flatMap((step, index) => {
    const stepNode = node(
      "div",
      [
        node("div", String(index + 1), {
          color: "#0f172a",
          backgroundColor: "#67e8f9",
          width: 30,
          height: 30,
          borderRadius: 15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 700,
        }),
        node("div", step.label, { color: "#f8fafc", fontSize: 16, fontWeight: 700, marginTop: 8 }),
        node("div", `レス${step.number}`, { color: "#67e8f9", fontSize: 14, marginTop: 3 }),
      ],
      { display: "flex", flexDirection: "column", alignItems: "center", width: "22%" },
    );
    return index < steps.length - 1
      ? [stepNode, node("div", "→", { color: "#64748b", fontSize: 26, marginTop: 12, width: "4%" })]
      : [stepNode];
  });
  return node(
    "div",
    [
      node("div", "議論の流れ", {
        color: "#f8fafc",
        fontSize: 23,
        fontWeight: 700,
        marginBottom: 12,
      }),
      node("div", stepNodes, {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }),
    ],
    {
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#111827",
      border: "1px solid #334155",
      borderRadius: 14,
      padding: 16,
      marginTop: 4,
      marginBottom: 14,
    },
  );
}

// 変更理由: 判定画像は文章を読み込む媒体ではなく、総合判定・争点・主張の関係を
// 最初に把握する媒体とする。長文の根拠はMarkdownへ残し、画像では比較と流れを優先する。
function buildCompactSatoriElement(result: DebateResult, height: number): ReactNode {
  const participantIds = participantIdsForResult(result);
  const verdict = overallVerdict(result);
  const issues = result.issues.slice(0, 6);
  const statusChips = issues.map((issue, index) => {
    const tone = issueStatusTone(issue.status);
    return node(
      "div",
      [
        node("span", `${index + 1}`, {
          color: "#0f172a",
          backgroundColor: tone.stroke,
          width: 22,
          height: 22,
          borderRadius: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          marginRight: 7,
        }),
        node("span", compactText(issue.topic, 28), { color: "#f8fafc", fontSize: 15 }),
        node("span", statusLabel(issue.status), { color: tone.text, fontSize: 13, marginLeft: 7 }),
      ],
      {
        display: "flex",
        alignItems: "center",
        backgroundColor: tone.fill,
        border: `1px solid ${tone.stroke}`,
        borderRadius: 12,
        padding: "7px 10px",
        marginRight: 8,
        marginBottom: 8,
      },
    );
  });
  return node(
    "div",
    [
      node(
        "div",
        [
          node("span", "ChLens 議論判定", { color: "#67e8f9", fontSize: 18, fontWeight: 700 }),
          node("span", verdict.label, {
            color: verdict.text,
            backgroundColor: verdict.fill,
            border: `1px solid ${verdict.stroke}`,
            borderRadius: 16,
            padding: "7px 14px",
            fontSize: 18,
            fontWeight: 700,
          }),
        ],
        { display: "flex", alignItems: "center", justifyContent: "space-between" },
      ),
      node("div", compactText(result.thread.title, 112), {
        color: "#f8fafc",
        fontSize: 31,
        fontWeight: 700,
        lineHeight: 1.2,
        marginTop: 14,
      }),
      node("div", compactText(result.summary, 150), {
        color: "#cbd5e1",
        fontSize: 18,
        lineHeight: 1.3,
        marginTop: 8,
      }),
      node(
        "div",
        [
          node("div", verdict.detail, { color: verdict.text, fontSize: 16, fontWeight: 700 }),
          node("div", compactText(result.conclusion, 150), {
            color: "#fefce8",
            fontSize: 20,
            lineHeight: 1.25,
            marginTop: 5,
          }),
        ],
        {
          display: "flex",
          flexDirection: "column",
          backgroundColor: verdict.fill,
          border: `1px solid ${verdict.stroke}`,
          borderRadius: 14,
          padding: 14,
          marginTop: 14,
          marginBottom: 16,
        },
      ),
      node("div", "判定の内訳", {
        color: "#f8fafc",
        fontSize: 22,
        fontWeight: 700,
        marginBottom: 9,
      }),
      node("div", statusChips, { display: "flex", flexWrap: "wrap", marginBottom: 4 }),
      node("div", "主張の比較", {
        color: "#f8fafc",
        fontSize: 22,
        fontWeight: 700,
        marginBottom: 9,
      }),
      ...issues.map((issue) => compactIssueNode(issue, participantIds)),
      compactTimelineNode(result),
      participantIds.length > 0
        ? node(
            "div",
            [
              node("div", "参加者", {
                color: "#f8fafc",
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 9,
              }),
              node(
                "div",
                result.participants
                  .slice(0, 8)
                  .map((participant) => compactParticipantNode(participant, participantIds)),
                { display: "flex", flexWrap: "wrap" },
              ),
            ],
            { display: "flex", flexDirection: "column" },
          )
        : null,
      node("div", "詳細な根拠・引用はMarkdown版を参照してください。", {
        color: "#94a3b8",
        fontSize: 14,
        borderTop: "1px solid #334155",
        paddingTop: 11,
        marginTop: 3,
      }),
    ].filter((child): child is ReactNode => child != null),
    {
      display: "flex",
      flexDirection: "column",
      width: CARD_WIDTH,
      height,
      flexShrink: 0,
      backgroundColor: "#0f172a",
      color: "#f8fafc",
      padding: 32,
      fontFamily: "ChLensSans",
    },
  );
}

const FONT_CANDIDATES = [
  // SatoriのOpenTypeパーサーはWindowsのTTCを扱えないため、静的TTFを先に試す。
  "C:\\Windows\\Fonts\\yumin.ttf",
  "C:\\Windows\\Fonts\\meiryo.ttc",
  "C:\\Windows\\Fonts\\YuGothM.ttc",
  "C:\\Windows\\Fonts\\msgothic.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansJP-Regular.otf",
  "/usr/share/fonts/truetype/noto/NotoSansJP-Regular.ttf",
  "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
  "C:\\Windows\\Fonts\\arial.ttf",
];

let fontCache: Promise<Buffer[]> | null = null;

async function loadFontData(): Promise<Buffer[]> {
  if (!fontCache) {
    fontCache = (async () => {
      for (const candidate of FONT_CANDIDATES) {
        if (!existsSync(candidate)) continue;
        try {
          return [await readFile(candidate)];
        } catch (error: unknown) {
          console.error(`[ChLens MCP] フォントの読み込みに失敗しました: ${candidate}`, error);
        }
      }
      return [];
    })();
  }
  return fontCache;
}

function wrapFallbackLines(value: string, width = 54): string[] {
  const normalized = asText(value, MAX_RENDER_TEXT_LENGTH);
  return normalized.split(/\r?\n/).flatMap((line) => {
    const chars = Array.from(line);
    if (chars.length === 0) return [""];
    const wrapped: string[] = [];
    for (let index = 0; index < chars.length; index += width) {
      wrapped.push(chars.slice(index, index + width).join(""));
    }
    return wrapped;
  });
}

function renderCompactFallbackSvg(result: DebateResult): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    weight = 400,
    anchor = "start",
  ) =>
    `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escape(value)}</text>`;
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string,
    radius = 14,
  ) =>
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
  const compactLines = (value: string, width: number, maxLines: number) =>
    wrapFallbackLines(compactText(value, width * maxLines), width).slice(0, maxLines);
  const participantIds = participantIdsForResult(result);
  const verdict = overallVerdict(result);
  const nodes: string[] = [`<rect width="100%" height="100%" fill="#0f172a"/>`];
  let cursor = 34;
  nodes.push(text("ChLens 議論判定", 40, cursor + 4, 22, "#67e8f9", 700));
  nodes.push(rect(915, cursor - 22, 245, 42, verdict.fill, verdict.stroke, 20));
  nodes.push(text(verdict.label, 1037, cursor + 6, 19, verdict.text, 700, "middle"));
  cursor += 50;
  for (const line of compactLines(result.thread.title, 42, 2)) {
    nodes.push(text(line, 40, cursor + 25, 31, "#f8fafc", 700));
    cursor += 37;
  }
  nodes.push(text(compactText(result.summary, 190), 40, cursor + 22, 18, "#cbd5e1"));
  cursor += 48;
  nodes.push(rect(40, cursor, CARD_WIDTH - 80, 88, verdict.fill, verdict.stroke));
  nodes.push(text(verdict.detail, 62, cursor + 28, 16, verdict.text, 700));
  nodes.push(text(compactText(result.conclusion, 180), 62, cursor + 58, 20, "#fefce8", 500));
  cursor += 112;
  nodes.push(text("判定の内訳", 40, cursor + 23, 23, "#f8fafc", 700));
  cursor += 38;
  let chipX = 40;
  let chipY = cursor;
  for (const [index, issue] of result.issues.slice(0, 6).entries()) {
    const tone = issueStatusTone(issue.status);
    const chipWidth = 330;
    if (chipX + chipWidth > CARD_WIDTH - 40) {
      chipX = 40;
      chipY += 40;
    }
    nodes.push(rect(chipX, chipY, chipWidth, 32, tone.fill, tone.stroke, 10));
    nodes.push(
      text(
        `${index + 1}  ${compactText(issue.topic, 22)}`,
        chipX + 12,
        chipY + 21,
        15,
        "#f8fafc",
        500,
      ),
    );
    nodes.push(
      text(
        statusLabel(issue.status),
        chipX + chipWidth - 12,
        chipY + 21,
        13,
        tone.text,
        500,
        "end",
      ),
    );
    chipX += chipWidth + 10;
  }
  cursor = chipY + 56;
  nodes.push(text("主張の比較", 40, cursor + 23, 23, "#f8fafc", 700));
  cursor += 38;
  for (const issue of result.issues.slice(0, 6)) {
    const status = issueStatusTone(issue.status);
    const issueY = cursor;
    nodes.push(rect(40, issueY, CARD_WIDTH - 80, 194, "#111827", status.stroke));
    nodes.push(rect(58, issueY + 14, 120, 28, status.fill, status.stroke, 10));
    nodes.push(text(statusLabel(issue.status), 118, issueY + 33, 14, status.text, 700, "middle"));
    nodes.push(text(compactText(issue.topic, 42), 194, issueY + 34, 21, "#f8fafc", 700));
    const compareIds = participantIds.slice(0, 2);
    compareIds.forEach((id, index) => {
      const position = positionForParticipant(issue, id);
      const tone = participantTone(id, participantIds);
      const cardX = index === 0 ? 58 : 622;
      nodes.push(rect(cardX, issueY + 57, 500, 86, tone.fill, tone.stroke, 11));
      nodes.push(
        text(participantLabel(id, participantIds), cardX + 16, issueY + 80, 16, tone.text, 700),
      );
      nodes.push(
        text(
          compactText(position?.claim ?? "この争点への主張は記載なし", 58),
          cardX + 16,
          issueY + 106,
          16,
          "#f8fafc",
        ),
      );
      nodes.push(
        text(
          refsLabel(position?.evidence.flatMap((evidence) => evidence.responseNumbers) ?? []),
          cardX + 16,
          issueY + 129,
          13,
          tone.text,
        ),
      );
    });
    if (compareIds.length > 1)
      nodes.push(text("↔", 600, issueY + 104, 28, "#fef08a", 700, "middle"));
    nodes.push(
      text(`判定: ${compactText(issue.conclusion, 102)}`, 58, issueY + 167, 15, "#fef08a"),
    );
    cursor += 208;
  }
  const steps = timelineSteps(result);
  if (steps.length > 0) {
    nodes.push(rect(40, cursor, CARD_WIDTH - 80, 118, "#111827", "#334155"));
    nodes.push(text("議論の流れ", 58, cursor + 28, 22, "#f8fafc", 700));
    const stepWidth = (CARD_WIDTH - 140) / steps.length;
    steps.forEach((step, index) => {
      const x = 70 + index * stepWidth;
      nodes.push(`<circle cx="${x}" cy="${cursor + 66}" r="15" fill="#67e8f9"/>`);
      nodes.push(text(String(index + 1), x, cursor + 72, 15, "#0f172a", 700, "middle"));
      nodes.push(text(step.label, x, cursor + 94, 15, "#f8fafc", 700, "middle"));
      nodes.push(text(`レス${step.number}`, x, cursor + 111, 13, "#67e8f9", 400, "middle"));
      if (index < steps.length - 1)
        nodes.push(text("→", x + stepWidth / 2, cursor + 72, 23, "#64748b", 400, "middle"));
    });
    cursor += 138;
  }
  if (result.participants.length > 0) {
    nodes.push(text("参加者", 40, cursor + 23, 23, "#f8fafc", 700));
    cursor += 38;
    result.participants.slice(0, 8).forEach((participant, index) => {
      const row = Math.floor(index / 2);
      const column = index % 2;
      const cardX = 40 + column * 570;
      const cardY = cursor + row * 112;
      const tone = participantTone(participant.id, participantIds);
      nodes.push(rect(cardX, cardY, 540, 96, tone.fill, tone.stroke, 11));
      nodes.push(
        text(
          participantLabel(participant.id, participantIds),
          cardX + 18,
          cardY + 24,
          17,
          tone.text,
          700,
        ),
      );
      nodes.push(text(participant.id, cardX + 120, cardY + 24, 13, "#94a3b8"));
      nodes.push(
        text(compactText(participant.position, 58), cardX + 18, cardY + 51, 15, "#f8fafc"),
      );
      if (participant.score)
        nodes.push(
          text(
            `論理 ${participant.score.logic.toFixed(1)}　読解 ${participant.score.reading.toFixed(1)}　根拠 ${participant.score.evidence.toFixed(1)}`,
            cardX + 18,
            cardY + 78,
            13,
            "#cbd5e1",
          ),
        );
    });
    cursor += Math.ceil(Math.min(result.participants.length, 8) / 2) * 112;
  }
  nodes.push(`<line x1="40" y1="${cursor + 8}" x2="1160" y2="${cursor + 8}" stroke="#334155"/>`);
  nodes.push(
    text("詳細な根拠・引用はMarkdown版を参照してください。", 40, cursor + 34, 14, "#94a3b8"),
  );
  cursor += 62;
  const height = Math.min(3_600, Math.max(1_100, cursor));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${height}" viewBox="0 0 ${CARD_WIDTH} ${height}"><g font-family="Meiryo, 'Noto Sans JP', sans-serif">${nodes.join("")}</g></svg>`;
}

function renderFallbackSvg(result: DebateResult): string {
  return renderCompactFallbackSvg(result);
}

function estimatedLines(value: string, charsPerLine: number): number {
  return Math.max(1, Math.ceil(Array.from(asText(value)).length / charsPerLine));
}

function estimateIssueHeight(issue: DebateIssue): number {
  // 変更理由: 画像は根拠全文を読む場所ではなく、争点の関係を把握する図なので、
  // 主張・判定を短く切り詰めた固定高さで見積もり、情報量に引っ張られないようにする。
  return 214 + (issue.positions.length > 2 ? 18 : 0);
}

function estimateParticipantHeight(participant: DebateParticipant): number {
  void participant;
  return 132;
}

export async function renderDebateSvg(result: DebateResult): Promise<string> {
  const issues = result.issues.slice(0, 6);
  const issueHeight = issues.reduce((height, issue) => height + estimateIssueHeight(issue) + 12, 0);
  const participants = result.participants.slice(0, 8);
  const participantCardHeight = participants.reduce(
    (height, participant) => Math.max(height, estimateParticipantHeight(participant)),
    0,
  );
  const participantHeight =
    participants.length > 0 ? 50 + Math.ceil(participants.length / 2) * participantCardHeight : 0;
  const timelineHeight = uniqueResponseNumbers(result).length > 0 ? 155 : 0;
  const headerHeight =
    370 + estimatedLines(result.thread.title, 42) * 37 + estimatedLines(result.summary, 190) * 24;
  const height = Math.min(
    // 変更理由: 主要な図解を固定の短いブロックで積み上げ、従来の全文表示による
    // 縦長化を防ぎつつ、フォントごとの実測行高の差で末尾が切れないよう余白を持たせる。
    6_000,
    Math.max(1_500, headerHeight + issueHeight + timelineHeight + participantHeight + 300),
  );
  const fontData = await loadFontData();
  if (fontData.length === 0) return renderFallbackSvg(result);
  try {
    return await satori(buildCompactSatoriElement(result, height), {
      width: CARD_WIDTH,
      height,
      fonts: [
        { name: "ChLensSans", data: fontData[0], weight: 400, style: "normal" },
        { name: "ChLensSans", data: fontData[0], weight: 700, style: "normal" },
      ],
    });
  } catch (error: unknown) {
    console.error("[ChLens MCP] Satoriで判定画像を生成できませんでした", error);
    return renderFallbackSvg(result);
  }
}

export function renderDebatePng(svg: string): Buffer {
  return new Resvg(svg, {
    font: {
      loadSystemFonts: true,
      fontDirs: ["C:\\Windows\\Fonts", "/usr/share/fonts", "/System/Library/Fonts"],
    },
    logLevel: "error",
  })
    .render()
    .asPng();
}

function outputDirectory(): string {
  const configured = process.env.CHLENS_DEBATE_OUTPUT_DIR?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(os.homedir(), "ChLens", "debate-results");
}

function safeBaseName(result: DebateResult, name: string | undefined): string {
  const requested =
    name?.trim() || `${new Date().toISOString().replace(/[:.]/g, "-")}-${result.thread.title}`;
  const safe = requested
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
  return safe || `debate-${Date.now()}`;
}

export function normalizeDebateFormats(value: unknown): DebateOutputFormat[] {
  if (value == null) return [...DEFAULT_FORMATS];
  if (!Array.isArray(value)) throw new Error("formatsは配列で指定してください");
  const allowed = new Set<DebateOutputFormat>(DEFAULT_FORMATS);
  const formats = [...new Set(value)].filter((item): item is DebateOutputFormat =>
    allowed.has(item as DebateOutputFormat),
  );
  if (formats.length !== value.length || formats.length === 0) {
    throw new Error("formatsにはjson、markdown、text、svg、pngのいずれかを指定してください");
  }
  return formats;
}

export async function saveDebateResult(
  result: DebateResult,
  formats: readonly DebateOutputFormat[],
  name?: string,
): Promise<SavedDebateResult> {
  const directory = outputDirectory();
  await mkdir(directory, { recursive: true });
  const baseName = safeBaseName(result, name);
  const files: SavedDebateFile[] = [];
  let svg: string | undefined;
  for (const format of formats) {
    const filePath = path.join(directory, `${baseName}.${format}`);
    if (format === "json") {
      await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    } else if (format === "markdown") {
      await writeFile(filePath, `${formatDebateMarkdown(result)}\n`, "utf8");
    } else if (format === "text") {
      await writeFile(filePath, `${formatDebateText(result)}\n`, "utf8");
    } else {
      svg ??= await renderDebateSvg(result);
      await writeFile(filePath, format === "svg" ? svg : renderDebatePng(svg));
    }
    files.push({ format, path: filePath });
  }
  return { directory, files };
}
