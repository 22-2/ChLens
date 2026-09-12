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

interface SatoriStyle {
  [key: string]: string | number | boolean | SatoriStyle | string[];
}

function node(type: string, children: ReactNode, style: SatoriStyle = {}): ReactNode {
  return {
    type,
    props: { children, style },
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

function scoreLabel(participant: DebateParticipant): string {
  if (!participant.score) return "採点なし";
  return `論理 ${participant.score.logic.toFixed(1)} / 読解 ${participant.score.reading.toFixed(1)} / 根拠 ${participant.score.evidence.toFixed(1)}`;
}

function issueNode(issue: DebateIssue): ReactNode {
  const positionNodes = issue.positions.slice(0, 8).map((position) =>
    node(
      "div",
      [
        node("div", position.participantIds.join(", ") || "参加者不明", {
          color: "#93c5fd",
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 4,
        }),
        node("div", asText(position.claim, 260), {
          color: "#e2e8f0",
          fontSize: 22,
          lineHeight: 1.35,
        }),
      ],
      { display: "flex", flexDirection: "column", marginBottom: 14 },
    ),
  );
  const evidenceNodes = issue.evidence.slice(0, 8).flatMap((evidence) => [
    node("span", `${evidence.role}: ${asText(evidence.note, 190)} `, {
      color: "#cbd5e1",
      fontSize: 17,
    }),
    node("span", evidence.responseNumbers.map((num) => `#${num}`).join(", "), {
      color: "#67e8f9",
      fontSize: 17,
    }),
  ]);
  return node(
    "div",
    [
      node(
        "div",
        [
          node("span", statusLabel(issue.status), {
            color: "#0f172a",
            backgroundColor: "#67e8f9",
            borderRadius: 14,
            padding: "4px 12px",
            fontSize: 17,
            fontWeight: 700,
          }),
          node("span", asText(issue.topic, 120), {
            color: "#f8fafc",
            fontSize: 25,
            fontWeight: 700,
            marginLeft: 12,
          }),
        ],
        { display: "flex", alignItems: "center", marginBottom: 10 },
      ),
      node("div", asText(issue.conclusion, 320), {
        color: "#f8fafc",
        fontSize: 23,
        lineHeight: 1.35,
        marginBottom: 14,
      }),
      ...positionNodes,
      evidenceNodes.length > 0
        ? node("div", evidenceNodes, {
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            borderTop: "1px solid #334155",
            paddingTop: 10,
          })
        : null,
    ].filter((child): child is ReactNode => child != null),
    {
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#172554",
      border: "1px solid #2563eb",
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
    },
  );
}

function participantNode(participant: DebateParticipant): ReactNode {
  return node(
    "div",
    [
      node("div", participant.id, {
        color: "#fda4af",
        fontSize: 22,
        fontWeight: 700,
        marginBottom: 6,
      }),
      node("div", asText(participant.position, 220), {
        color: "#f8fafc",
        fontSize: 20,
        lineHeight: 1.3,
      }),
      node("div", scoreLabel(participant), { color: "#cbd5e1", fontSize: 17, marginTop: 8 }),
      participant.strengths.length > 0
        ? node("div", `有効点: ${asText(participant.strengths.join(" / "), 180)}`, {
            color: "#86efac",
            fontSize: 17,
            marginTop: 8,
          })
        : null,
      participant.weaknesses.length > 0
        ? node("div", `弱点: ${asText(participant.weaknesses.join(" / "), 180)}`, {
            color: "#fda4af",
            fontSize: 17,
            marginTop: 4,
          })
        : null,
    ].filter((child): child is ReactNode => child != null),
    {
      display: "flex",
      flexDirection: "column",
      // 変更理由: 参加者が増えたときも1枚の横幅へ押し込めず、2列のカードとして
      // 折り返すことで、Satori画像内の文字が極端に細くならないようにする。
      width: "48%",
      flexGrow: 0,
      flexShrink: 0,
      backgroundColor: "#3f172a",
      border: "1px solid #be123c",
      borderRadius: 14,
      padding: 16,
      marginRight: 12,
      marginBottom: 12,
    },
  );
}

function buildSatoriElement(result: DebateResult, height: number): ReactNode {
  return node(
    "div",
    [
      node("div", "ChLens 議論判定", {
        color: "#67e8f9",
        fontSize: 20,
        fontWeight: 700,
        marginBottom: 10,
      }),
      node("div", asText(result.thread.title, 170), {
        color: "#f8fafc",
        fontSize: 34,
        fontWeight: 800,
        lineHeight: 1.2,
      }),
      node("div", asText(result.summary, 420), {
        color: "#cbd5e1",
        fontSize: 21,
        lineHeight: 1.35,
        marginTop: 16,
      }),
      node("div", asText(`結論: ${result.conclusion}`, 460), {
        color: "#fef08a",
        fontSize: 25,
        fontWeight: 700,
        lineHeight: 1.35,
        backgroundColor: "#422006",
        border: "1px solid #ca8a04",
        borderRadius: 14,
        padding: 16,
        marginTop: 18,
        marginBottom: 22,
      }),
      node("div", "争点別判定", {
        color: "#f8fafc",
        fontSize: 26,
        fontWeight: 700,
        marginBottom: 12,
      }),
      ...result.issues.slice(0, 12).map(issueNode),
      result.participants.length > 0
        ? node(
            "div",
            [
              node("div", "参加者別評価", {
                color: "#f8fafc",
                fontSize: 26,
                fontWeight: 700,
                marginTop: 8,
                marginBottom: 12,
              }),
              node("div", result.participants.slice(0, 16).map(participantNode), {
                display: "flex",
                flexWrap: "wrap",
              }),
            ],
            { display: "flex", flexDirection: "column" },
          )
        : null,
      result.caveats && result.caveats.length > 0
        ? node("div", `留意点: ${asText(result.caveats.join(" / "), 380)}`, {
            color: "#cbd5e1",
            fontSize: 17,
            lineHeight: 1.35,
            borderTop: "1px solid #334155",
            paddingTop: 12,
            marginTop: 8,
          })
        : null,
    ].filter((child): child is ReactNode => child != null),
    {
      display: "flex",
      flexDirection: "column",
      width: CARD_WIDTH,
      height,
      backgroundColor: "#0f172a",
      color: "#f8fafc",
      padding: 34,
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

function renderFallbackSvg(result: DebateResult): string {
  interface FallbackBlock {
    title: string;
    lines: string[];
    fill: string;
    stroke: string;
  }

  const block = (
    title: string,
    lines: string[],
    fill = "#1e293b",
    stroke = "#334155",
  ): FallbackBlock => ({
    title,
    lines: lines.length > 0 ? lines.slice(0, 12) : ["（記載なし）"],
    fill,
    stroke,
  });

  const statusColors: Record<DebateIssue["status"], { fill: string; stroke: string }> = {
    resolved: { fill: "#052e16", stroke: "#22c55e" },
    mixed: { fill: "#422006", stroke: "#f59e0b" },
    unresolved: { fill: "#450a0a", stroke: "#ef4444" },
    "insufficient-evidence": { fill: "#1e1b4b", stroke: "#a78bfa" },
  };

  const blocks: FallbackBlock[] = [
    block("概要", wrapFallbackLines(result.summary)),
    block("結論", wrapFallbackLines(result.conclusion), "#422006", "#ca8a04"),
    ...result.issues.slice(0, 12).map((issue) => {
      const issueLines = [
        ...wrapFallbackLines(issue.conclusion),
        ...issue.positions
          .slice(0, 5)
          .flatMap((position) =>
            wrapFallbackLines(
              `・${position.participantIds.join(", ") || "参加者不明"}: ${position.claim}`,
            ),
          ),
        ...issue.evidence
          .slice(0, 4)
          .flatMap((evidence) =>
            wrapFallbackLines(
              `根拠(${evidence.role}) #${evidence.responseNumbers.join(", #")}: ${evidence.note}`,
            ),
          ),
      ];
      const colors = statusColors[issue.status];
      return block(
        `${statusLabel(issue.status)}　${issue.topic}`,
        issueLines,
        colors.fill,
        colors.stroke,
      );
    }),
    ...(result.participants.length > 0
      ? [
          block(
            "参加者別評価",
            result.participants.slice(0, 16).flatMap((participant) => {
              const lines = [
                `・${participant.id}: ${participant.position}`,
                scoreLabel(participant),
              ];
              if (participant.strengths.length > 0)
                lines.push(`有効点: ${participant.strengths.join(" / ")}`);
              if (participant.weaknesses.length > 0)
                lines.push(`弱点: ${participant.weaknesses.join(" / ")}`);
              return lines.flatMap((line) => wrapFallbackLines(line));
            }),
            "#3f172a",
            "#be123c",
          ),
        ]
      : []),
    ...(result.caveats && result.caveats.length > 0
      ? [
          block(
            "留意点",
            result.caveats.flatMap((caveat) => wrapFallbackLines(`・${caveat}`)),
          ),
        ]
      : []),
  ];

  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  const titleLines = wrapFallbackLines(result.thread.title, 54).slice(0, 2);
  const blockWidth = CARD_WIDTH - 80;
  const blockPadding = 22;
  const titleLineHeight = 30;
  const lineHeight = 28;
  const headerHeight = 64 + titleLines.length * 34;
  let cursor = headerHeight;
  const blockNodes = blocks
    .map((item) => {
      const blockHeight = blockPadding * 2 + titleLineHeight + item.lines.length * lineHeight;
      const y = cursor;
      cursor += blockHeight + 18;
      const title = `<text x="${40 + blockPadding}" y="${y + blockPadding + 22}" fill="#f8fafc" font-size="23" font-weight="700">${escape(item.title)}</text>`;
      const lines = item.lines
        .map(
          (line, index) =>
            `<text x="${40 + blockPadding}" y="${y + blockPadding + titleLineHeight + (index + 1) * lineHeight}" fill="#e2e8f0" font-size="19">${escape(line)}</text>`,
        )
        .join("");
      return `<rect x="40" y="${y}" width="${blockWidth}" height="${blockHeight}" rx="16" fill="${item.fill}" stroke="${item.stroke}" stroke-width="2"/>${title}${lines}`;
    })
    .join("");
  const height = Math.min(6_000, Math.max(720, cursor + 24));
  const header = [
    `<text x="40" y="42" fill="#67e8f9" font-size="22" font-weight="700">ChLens 議論判定</text>`,
    ...titleLines.map(
      (line, index) =>
        `<text x="40" y="${76 + index * 34}" fill="#f8fafc" font-size="30" font-weight="700">${escape(line)}</text>`,
    ),
  ].join("");
  // 変更理由: Satoriが実行環境のフォント形式に対応できない場合でも、
  // ブラウザやresvgのシステムフォントで、判定の区切りと状態を視認できる画像を作る。
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${height}" viewBox="0 0 ${CARD_WIDTH} ${height}"><rect width="100%" height="100%" fill="#0f172a"/><g font-family="Meiryo, 'Noto Sans JP', sans-serif">${header}${blockNodes}</g></svg>`;
}

function estimatedLines(value: string, charsPerLine: number): number {
  return Math.max(1, Math.ceil(Array.from(asText(value)).length / charsPerLine));
}

function estimateIssueHeight(issue: DebateIssue): number {
  const positionHeight = issue.positions
    .slice(0, 8)
    .reduce((height, position) => height + 38 + estimatedLines(position.claim, 42) * 30, 0);
  const evidenceHeight = issue.evidence
    .slice(0, 8)
    .reduce((height, evidence) => height + 24 + estimatedLines(evidence.note, 56) * 22, 0);
  return (
    76 +
    estimatedLines(issue.topic, 30) * 30 +
    estimatedLines(issue.conclusion, 48) * 31 +
    positionHeight +
    evidenceHeight
  );
}

function estimateParticipantHeight(participant: DebateParticipant): number {
  const strengths = participant.strengths.join(" / ");
  const weaknesses = participant.weaknesses.join(" / ");
  return (
    48 +
    estimatedLines(participant.position, 32) * 26 +
    28 +
    (strengths ? 24 + estimatedLines(strengths, 38) * 22 : 0) +
    (weaknesses ? 24 + estimatedLines(weaknesses, 38) * 22 : 0)
  );
}

export async function renderDebateSvg(result: DebateResult): Promise<string> {
  const issueHeight = result.issues
    .slice(0, 12)
    .reduce((height, issue) => height + estimateIssueHeight(issue) + 16, 0);
  const participants = result.participants.slice(0, 16);
  const participantCardHeight = participants.reduce(
    (height, participant) => Math.max(height, estimateParticipantHeight(participant)),
    0,
  );
  const participantHeight =
    participants.length > 0 ? 64 + Math.ceil(participants.length / 2) * participantCardHeight : 0;
  const headerHeight =
    300 +
    estimatedLines(result.thread.title, 36) * 38 +
    estimatedLines(result.summary, 58) * 29 +
    estimatedLines(result.conclusion, 52) * 33;
  const height = Math.min(
    // 変更理由: 長い日本語や根拠の折り返しでカードが想定より高くなるため、
    // 項目数と内容量から余裕を持って高さを確保し、画像下部の切り落としを防ぐ。
    6_000,
    Math.max(720, headerHeight + issueHeight + participantHeight + 40),
  );
  const fontData = await loadFontData();
  if (fontData.length === 0) return renderFallbackSvg(result);
  try {
    return await satori(buildSatoriElement(result, height), {
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
