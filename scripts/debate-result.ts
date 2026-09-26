import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";

import {
  type DebateEvidence,
  type DebateIssue,
  type DebateParticipant,
  type DebateResult,
  formatDebateMarkdown,
  formatDebateText,
} from "../src/mcp/debate.ts";

export type DebateOutputFormat = "json" | "markdown" | "text" | "html" | "png";

export interface SavedDebateFile {
  format: DebateOutputFormat;
  path: string;
}

export interface SavedDebateResult {
  directory: string;
  files: SavedDebateFile[];
}

const DEFAULT_FORMATS: DebateOutputFormat[] = ["json", "markdown", "text", "html", "png"];
const CARD_WIDTH = 1200;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function statusClass(status: DebateIssue["status"]): string {
  return `status-${status}`;
}

function safeHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch (error: unknown) {
    console.error("[ChLens MCP] 判定カードのURLを解釈できませんでした", error);
    return "";
  }
}

function overallVerdict(result: DebateResult): { label: string; detail: string; tone: string } {
  const statuses = result.issues.map((issue) => issue.status);
  if (statuses.length === 0) {
    return { label: "判定材料なし", detail: "争点が登録されていません", tone: "neutral" };
  }
  if (statuses.every((status) => status === "resolved")) {
    return { label: "争点を整理", detail: "提示された範囲では大筋が一致", tone: "resolved" };
  }
  if (statuses.some((status) => status === "unresolved")) {
    return { label: "未決着", detail: "重要な食い違いが残っています", tone: "unresolved" };
  }
  if (statuses.some((status) => status === "insufficient-evidence")) {
    return { label: "根拠不足", detail: "外部事実の確認が必要です", tone: "insufficient-evidence" };
  }
  return { label: "条件付き", detail: "条件をそろえると評価が変わります", tone: "mixed" };
}

function responseLink(url: string, num: number): string {
  return `${safeHttpUrl(url).replace(/\/+$/, "")}/${num}`;
}

function responseRefs(url: string, values: readonly number[]): string {
  if (values.length === 0) return '<span class="muted">レス番号なし</span>';
  return values
    .map(
      (num) =>
        `<a href="${escapeHtml(responseLink(url, num))}">レス${num}</a>`,
    )
    .join("、");
}

function evidenceHtml(url: string, evidence: DebateEvidence): string {
  const roleLabels: Record<DebateEvidence["role"], string> = {
    support: "支持",
    challenge: "反証・異議",
    context: "文脈",
  };
  return `<li><span class="evidence-role">${roleLabels[evidence.role]}</span> ${escapeHtml(evidence.note)} <span class="refs">${responseRefs(url, evidence.responseNumbers)}</span></li>`;
}

function positionHtml(url: string, position: DebateIssue["positions"][number]): string {
  const ids = position.participantIds.length > 0 ? position.participantIds : ["参加者不明"];
  return `<article class="position-card">
    <h4>${ids.map((id) => `<span class="participant-id">${escapeHtml(id)}</span>`).join("、")} の主張</h4>
    <p class="preserve-text">${escapeHtml(position.claim)}</p>
    ${position.evidence.length > 0 ? `<h5>根拠</h5><ul>${position.evidence.map((evidence) => evidenceHtml(url, evidence)).join("")}</ul>` : ""}
  </article>`;
}

function issueHtml(url: string, issue: DebateIssue): string {
  return `<section class="issue-card ${statusClass(issue.status)}">
    <header class="issue-heading"><span class="status-badge">${statusLabel(issue.status)}</span><h3>${escapeHtml(issue.topic)}</h3></header>
    <p class="issue-conclusion preserve-text">${escapeHtml(issue.conclusion)}</p>
    ${issue.positions.length > 0 ? `<div class="positions">${issue.positions.map((position) => positionHtml(url, position)).join("")}</div>` : ""}
    ${issue.evidence.length > 0 ? `<div class="issue-evidence"><h4>争点全体の根拠</h4><ul>${issue.evidence.map((evidence) => evidenceHtml(url, evidence)).join("")}</ul></div>` : ""}
  </section>`;
}

function participantHtml(url: string, participant: DebateParticipant): string {
  const score = participant.score
    ? `<p class="score">論理 ${participant.score.logic.toFixed(1)} / 読解 ${participant.score.reading.toFixed(1)} / 根拠 ${participant.score.evidence.toFixed(1)}</p>`
    : '<p class="score muted">採点なし</p>';
  const list = (title: string, items: readonly string[]) =>
    items.length > 0
      ? `<div class="participant-notes"><h4>${title}</h4><ul>${items.map((item) => `<li class="preserve-text">${escapeHtml(item)}</li>`).join("")}</ul></div>`
      : "";
  return `<article class="participant-card">
    <header><h3>${escapeHtml(participant.id)}</h3><span class="refs">${responseRefs(url, participant.responseNumbers)}</span></header>
    <p class="preserve-text">${escapeHtml(participant.position)}</p>
    ${score}${list("有効点", participant.strengths)}${list("弱点", participant.weaknesses)}
  </article>`;
}

export function renderDebateHtml(result: DebateResult): string {
  const verdict = overallVerdict(result);
  const participants = result.participants;
  const caveats = result.caveats ?? [];
  const threadUrl = safeHttpUrl(result.thread.url);
  // 変更理由: 文章量や返信数を画像の推定高に合わせて削ると、判定に必要な主張が欠けるため、
  // 全項目を通常のHTMLフローで折り返し、内容に応じてカードと画像の高さを伸ばす。
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(result.thread.title)} - ChLens 議論判定</title>
<style>
  * { box-sizing: border-box; }
  html { background: #0b1120; }
  body { margin: 0; padding: 28px; background: #0b1120; color: #e2e8f0; font-family: "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif; }
  .sheet { width: ${CARD_WIDTH}px; margin: 0 auto; padding: 32px; background: #0f172a; border: 1px solid #334155; border-radius: 18px; }
  header, .heading, .issue-heading, .participant-card > header { display: flex; align-items: center; gap: 14px; }
  .topline { justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 16px; }
  .brand { color: #67e8f9; font-size: 18px; font-weight: 700; }
  .verdict { border: 1px solid #a78bfa; background: #1e1b4b; color: #ddd6fe; border-radius: 999px; padding: 8px 16px; font-weight: 700; }
  .verdict.resolved { border-color: #4ade80; background: #052e16; color: #bbf7d0; }
  .verdict.mixed { border-color: #fbbf24; background: #422006; color: #fef3c7; }
  .verdict.unresolved { border-color: #f87171; background: #450a0a; color: #fecaca; }
  h1 { margin: 18px 0 10px; color: #f8fafc; font-size: 30px; line-height: 1.4; }
  h2 { margin: 24px 0 12px; color: #f8fafc; font-size: 23px; }
  h3 { margin: 0; }
  h4 { margin: 0 0 8px; color: #bfdbfe; font-size: 16px; }
  h5 { margin: 12px 0 4px; color: #94a3b8; font-size: 14px; }
  p { margin: 0; }
  a { color: #67e8f9; text-decoration: underline; text-underline-offset: 2px; }
  .thread-link, .meta { color: #94a3b8; font-size: 14px; }
  .summary, .conclusion { margin-top: 16px; padding: 18px 20px; border-radius: 14px; background: #111827; border: 1px solid #334155; }
  .summary { color: #cbd5e1; }
  .conclusion { border-color: #a78bfa; background: #1e1b4b; }
  .conclusion h2 { margin: 0 0 8px; color: #ddd6fe; font-size: 18px; }
  .preserve-text { white-space: pre-wrap; overflow-wrap: anywhere; word-break: normal; line-height: 1.65; }
  .issue-card { margin: 14px 0; padding: 20px; border: 1px solid #475569; border-radius: 14px; background: #111827; }
  .issue-card.status-resolved { border-color: #4ade80; }
  .issue-card.status-mixed { border-color: #fbbf24; }
  .issue-card.status-unresolved { border-color: #f87171; }
  .status-badge { flex: none; border-radius: 999px; padding: 5px 11px; background: #1e1b4b; color: #ddd6fe; font-size: 14px; font-weight: 700; }
  .status-resolved .status-badge { background: #052e16; color: #bbf7d0; }
  .status-mixed .status-badge { background: #422006; color: #fef3c7; }
  .status-unresolved .status-badge { background: #450a0a; color: #fecaca; }
  .issue-heading h3 { color: #f8fafc; font-size: 21px; line-height: 1.45; }
  .issue-conclusion { margin: 12px 0; color: #fef08a; }
  .positions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .position-card { min-width: 0; padding: 16px; border: 1px solid #334155; border-radius: 11px; background: #172554; }
  .position-card:nth-child(2n) { background: #4c1d2a; }
  .participant-id { overflow-wrap: anywhere; }
  .issue-evidence { margin-top: 14px; padding-top: 12px; border-top: 1px solid #334155; }
  ul { margin: 6px 0 0; padding-left: 22px; }
  li { margin: 6px 0; line-height: 1.6; }
  .evidence-role { color: #67e8f9; font-weight: 700; }
  .refs { color: #94a3b8; font-size: 13px; }
  .participant-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .participant-card { min-width: 0; padding: 18px; border: 1px solid #334155; border-radius: 12px; background: #172554; }
  .participant-card:nth-child(2n) { background: #4c1d2a; }
  .participant-card > header { justify-content: space-between; flex-wrap: wrap; margin-bottom: 10px; }
  .participant-card h3 { color: #f8fafc; font-size: 18px; overflow-wrap: anywhere; }
  .score { margin-top: 10px; color: #cbd5e1; font-size: 14px; }
  .participant-notes { margin-top: 12px; }
  .caveats { margin-top: 16px; padding: 16px; border: 1px solid #475569; border-radius: 12px; }
  .muted { color: #94a3b8; }
</style></head><body><main class="sheet">
  <header class="topline"><span class="brand">ChLens 議論判定</span><span class="verdict ${verdict.tone}">${verdict.label}</span></header>
  <h1 class="preserve-text">${escapeHtml(result.thread.title)}</h1>
  <p class="thread-link">${threadUrl ? `<a href="${escapeHtml(threadUrl)}">スレッドを開く</a>` : "スレッドURLなし"}${result.thread.analyzedAt ? ` · 判定日時 ${escapeHtml(result.thread.analyzedAt)}` : ""}</p>
  <section class="summary"><h2>要約</h2><p class="preserve-text">${escapeHtml(result.summary)}</p></section>
  <section class="conclusion"><h2>${verdict.detail}</h2><p class="preserve-text">${escapeHtml(result.conclusion)}</p></section>
  <section><h2>争点別判定 <span class="meta">${result.issues.length}件</span></h2>${result.issues.map((issue) => issueHtml(result.thread.url, issue)).join("") || '<p class="muted">争点はありません。</p>'}</section>
  <section><h2>参加者別評価 <span class="meta">${participants.length}人</span></h2><div class="participant-grid">${participants.map((participant) => participantHtml(result.thread.url, participant)).join("")}</div></section>
  ${caveats.length > 0 ? `<section class="caveats"><h2>留意点</h2><ul>${caveats.map((item) => `<li class="preserve-text">${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
</main></body></html>`;
}

export async function renderDebatePng(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: CARD_WIDTH + 56, height: 1000 } });
    await page.setContent(html, { waitUntil: "load" });
    // 変更理由: 画面高で切らず、HTMLの自然な全高を画像に反映して全文を残す。
    const image = await page.locator(".sheet").screenshot({ type: "png", animations: "disabled" });
    return image;
  } finally {
    await browser.close();
  }
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
    throw new Error("formatsにはjson、markdown、text、html、pngのいずれかを指定してください");
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
  let html: string | undefined;
  let png: Buffer | undefined;
  for (const format of formats) {
    const filePath = path.join(directory, `${baseName}.${format}`);
    if (format === "json") {
      await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    } else if (format === "markdown") {
      await writeFile(filePath, `${formatDebateMarkdown(result)}\n`, "utf8");
    } else if (format === "text") {
      await writeFile(filePath, `${formatDebateText(result)}\n`, "utf8");
    } else {
      html ??= renderDebateHtml(result);
      if (format === "html") await writeFile(filePath, html, "utf8");
      else {
        png ??= await renderDebatePng(html);
        await writeFile(filePath, png);
      }
    }
    files.push({ format, path: filePath });
  }
  return { directory, files };
}
