import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";

import {
  type DebateEvidence,
  type DebateIssue,
  type DebateParticipant,
  type DebateResult,
  type DebateSimpleMetric,
  formatDebateMarkdown,
  formatDebateText,
} from "../src/mcp/debate.ts";

export type DebateOutputFormat =
  | "json"
  | "markdown"
  | "text"
  | "html"
  | "png"
  | "simple-html"
  | "simple-png";

export interface SavedDebateFile {
  format: DebateOutputFormat;
  path: string;
}

export interface SavedDebateResult {
  directory: string;
  files: SavedDebateFile[];
}

const DEFAULT_FORMATS: DebateOutputFormat[] = [
  "json",
  "markdown",
  "text",
  "html",
  "png",
  "simple-html",
  "simple-png",
];
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
  const researchStatusLabels = {
    supported: "おおむね裏付けあり",
    contradicted: "反証あり",
    inconclusive: "確認できず",
  } as const;
  const research =
    result.research.length > 0
      ? `<section class="research"><h2>不足根拠の外部調査</h2>${result.research
          .map(
            (item) =>
              `<article><h3>${researchStatusLabels[item.status]}: ${escapeHtml(item.claim)}</h3><p class="preserve-text">${escapeHtml(item.finding)}</p>${item.sources.length > 0 ? `<p class="refs">${item.sources.map((source) => `<a href="${escapeHtml(safeHttpUrl(source.url))}">${escapeHtml(source.title)}</a>`).join(" · ")}</p>` : ""}</article>`,
          )
          .join("")}</section>`
      : "";
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
  .research { margin: 20px 0; padding: 16px; border: 1px solid #155e75; border-radius: 12px; background: #082f49; }
  .research article + article { margin-top: 12px; padding-top: 12px; border-top: 1px solid #155e75; }
  .research h2, .research h3 { margin: 0 0 6px; color: #a5f3fc; }
  .research h2 { font-size: 19px; }
  .muted { color: #94a3b8; }
</style></head><body><main class="sheet image-root">
  <header class="topline"><span class="brand">ChLens 議論判定</span><span class="verdict ${verdict.tone}">${verdict.label}</span></header>
  <h1 class="preserve-text">${escapeHtml(result.thread.title)}</h1>
  <p class="thread-link">${threadUrl ? `<a href="${escapeHtml(threadUrl)}">スレッドを開く</a>` : "スレッドURLなし"}${result.thread.analyzedAt ? ` · 判定日時 ${escapeHtml(result.thread.analyzedAt)}` : ""}</p>
  <section class="summary"><h2>要約</h2><p class="preserve-text">${escapeHtml(result.summary)}</p></section>
  <section class="conclusion"><h2>${verdict.detail}</h2><p class="preserve-text">${escapeHtml(result.conclusion)}</p></section>
  ${research}
  <section><h2>争点別判定 <span class="meta">${result.issues.length}件</span></h2>${result.issues.map((issue) => issueHtml(result.thread.url, issue)).join("") || '<p class="muted">争点はありません。</p>'}</section>
  <section><h2>参加者別評価 <span class="meta">${participants.length}人</span></h2><div class="participant-grid">${participants.map((participant) => participantHtml(result.thread.url, participant)).join("")}</div></section>
  ${caveats.length > 0 ? `<section class="caveats"><h2>留意点</h2><ul>${caveats.map((item) => `<li class="preserve-text">${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
</main></body></html>`;
}

function simpleMetricRow(label: string, icon: string, metric: DebateSimpleMetric, tone: string): string {
  const dots = Array.from({ length: 5 }, (_, index) => {
    const fill = Math.max(0, Math.min(1, metric.score - index)) * 100;
    return `<span class="score-dot" style="--fill:${fill}%;--tone:${tone}"></span>`;
  }).join("");
  return `<article class="metric-row ${tone === "#38bdf8" ? "blue" : "red"}">
    <div class="metric-icon-box" aria-hidden="true">${icon}</div>
    <div class="metric-main"><div class="metric-upper"><strong>${label}</strong><span class="dot-meter">${dots}</span></div>
      <div class="metric-lower"><p class="metric-desc">${escapeHtml(metric.reason)}</p><strong class="score-number">${metric.score.toFixed(1)}<small>/5.0</small></strong></div>
    </div>
  </article>`;
}

export function renderSimpleDebateHtml(result: DebateResult): string {
  const view = result.simpleView;
  // 変更理由: 参考画像のゲージ・二列主張・三軸評価を再現しつつ、長文はHTMLで折り返して全量を残す。
  const bluePct = Math.round(view.blueAdvantage * 100);
  const redPct = 100 - bluePct;
  const side = (name: "blue" | "red") => {
    const value = view[name];
    const tone = name === "blue" ? "#38bdf8" : "#f87171";
    const claims = value.claims
      .map(
        (claim, index) =>
          `<li><span class="claim-number">${index + 1}</span><span class="claim-text">${escapeHtml(claim)}</span></li>`,
      )
      .join("");
    return `<section class="camp ${name}">
      <header class="camp-heading"><h2>主張</h2><p class="side-label">${escapeHtml(value.label)}${value.participants.length > 0 ? ` · ${value.participants.map(escapeHtml).join("、")}` : ""}</p></header>
      <ol class="claims">${claims || '<li class="empty">主張なし</li>'}</ol>
      <h2 class="metrics-heading">評価のポイント</h2>
      <div class="metrics">
        ${simpleMetricRow("論理的思考力", "◇", value.metrics.logic, tone)}
        ${simpleMetricRow("文章読解力", "▤", value.metrics.reading, tone)}
        ${simpleMetricRow("根拠の信頼性", "⬡", value.metrics.evidence, tone)}
      </div>
    </section>`;
  };
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(view.topic)} - ChLens 議論判定</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: #03060f; }
  body { padding: 14px; color: #f8fafc; font-family: "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif; }
  .image-root { width: 1200px; margin: 0 auto; overflow: visible; }
  .gauge-panel { display: grid; grid-template-columns: minmax(190px, 1fr) minmax(0, 4fr) minmax(190px, 1fr); align-items: center; gap: 14px; padding: 8px 14px; border: 1px solid #1e293b; border-radius: 5px; background: #090d1a; }
  .side-id { min-width: 0; overflow-wrap: anywhere; font-size: 15px; font-weight: 800; text-align: center; }
  .blue .side-id { color: #38bdf8; text-shadow: 0 0 5px rgba(56,189,248,.4); }
  .red .side-id { color: #f87171; text-shadow: 0 0 5px rgba(248,113,113,.4); }
  .gauge-center { min-width: 0; }
  .rates { display: flex; align-items: center; justify-content: space-between; font: 800 34px/1 Impact, "Arial Black", sans-serif; }
  .rates .blue-rate { color: #38bdf8; }
  .rates .red-rate { color: #f87171; }
  .topic { min-width: 0; padding: 4px 12px; color: #fff; font-size: 19px; font-weight: 900; line-height: 1.35; text-align: center; overflow-wrap: anywhere; white-space: pre-wrap; }
  .gauge { position: relative; display: flex; width: 100%; height: 14px; overflow: hidden; border: 1px solid #334155; border-radius: 3px; background: #020617; }
  .gauge-blue { background: linear-gradient(90deg,#0284c7,#38bdf8); }
  .gauge-red { background: linear-gradient(90deg,#f87171,#dc2626); }
  .gauge-center-line { position: absolute; left: 50%; top: 0; width: 2px; height: 100%; background: rgba(255,255,255,.45); }
  .columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .camp { min-width: 0; padding: 10px 12px; }
  .camp.blue { background: rgba(7,19,46,.9); border: 1px solid rgba(56,189,248,.25); border-right: 0; }
  .camp.red { background: rgba(36,11,19,.9); border: 1px solid rgba(248,113,133,.25); border-left: 1px solid #334155; }
  .camp-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; border-bottom: 1px solid rgba(255,255,255,.08); padding-bottom: 4px; }
  .camp-heading h2, .metrics-heading { margin: 0 0 5px; color: #cbd5e1; font-size: 18px; }
  .side-label { margin: 0; color: #94a3b8; font-size: 12px; text-align: right; overflow-wrap: anywhere; }
  .claims { display: flex; flex-direction: column; gap: 2px; margin: 4px 0 16px; padding: 4px; list-style: none; border-radius: 4px; background: rgba(0,0,0,.3); }
  .claims li { display: flex; align-items: flex-start; gap: 8px; min-width: 0; padding: 3px 4px; font-size: 16px; line-height: 1.5; }
  .claim-number { flex: none; display: inline-grid; place-items: center; width: 21px; height: 21px; margin-top: 1px; border-radius: 50%; color: #020617; font-size: 13px; font-weight: 800; }
  .blue .claim-number { background: #38bdf8; }
  .red .claim-number { background: #f87171; }
  .claim-text { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .metrics-heading { margin: 12px 0 5px; }
  .metrics { display: flex; flex-direction: column; gap: 4px; }
  .metric-row { display: grid; grid-template-columns: 52px minmax(0,1fr); align-items: center; gap: 10px; min-width: 0; padding: 6px 8px; border: 1px solid rgba(255,255,255,.04); border-radius: 3px; background: rgba(0,0,0,.25); }
  .metric-icon-box { display: grid; place-items: center; font-size: 36px; font-weight: 700; }
  .metric-row.blue .metric-icon-box, .metric-row.blue .score-number { color: #38bdf8; }
  .metric-row.red .metric-icon-box, .metric-row.red .score-number { color: #f87171; }
  .metric-main { min-width: 0; }
  .metric-upper { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px; }
  .metric-upper strong { color: #fff; font-size: 16px; }
  .dot-meter { display: flex; flex: none; gap: 4px; }
  .score-dot { width: 16px; height: 16px; border-radius: 50%; background: linear-gradient(90deg,var(--tone) var(--fill),#1e293b var(--fill)); }
  .metric-lower { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: start; gap: 10px; margin-top: 4px; }
  .metric-desc { min-width: 0; margin: 0; color: #cbd5e1; font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
  .score-number { flex: none; font: 800 26px/1 Impact,"Arial Black",sans-serif; text-align: right; }
  .score-number small { color: #64748b; font: 13px/1 "Yu Gothic UI",Meiryo,sans-serif; }
  .summary-panel { display: grid; grid-template-columns: 120px minmax(0,1fr); align-items: center; gap: 12px; padding: 9px 12px; border: 1px solid #1e293b; border-radius: 4px; background: #090d1a; }
  .summary-label { padding-right: 12px; border-right: 1px solid #334155; color: #eab308; font-size: 20px; font-weight: 900; text-align: center; }
  .summary-text { min-width: 0; color: #e2e8f0; font-size: 16px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .empty { color: #94a3b8; }
</style></head><body><main class="image-root">
  <section class="gauge-panel">
    <div class="side-id blue"><div class="rates"><span class="blue-rate">${bluePct}%</span></div>${escapeHtml(view.blue.label)}<br>${view.blue.participants.map(escapeHtml).join("、")}</div>
    <div class="gauge-center"><div class="topic">${escapeHtml(view.topic)}</div><div class="gauge"><div class="gauge-blue" style="width:${bluePct}%"></div><div class="gauge-red" style="width:${redPct}%"></div><i class="gauge-center-line"></i></div></div>
    <div class="side-id red"><div class="rates"><span class="red-rate">${redPct}%</span></div>${escapeHtml(view.red.label)}<br>${view.red.participants.map(escapeHtml).join("、")}</div>
  </section>
  <div class="columns">${side("blue")}${side("red")}</div>
  <section class="summary-panel"><div class="summary-label">総合評価</div><p class="summary-text">${escapeHtml(view.verdictReason)}</p></section>
</main></body></html>`;
}

export async function renderDebatePng(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: CARD_WIDTH + 56, height: 1000 } });
    await page.setContent(html, { waitUntil: "load" });
    // 変更理由: 画面高で切らず、HTMLの自然な全高を画像に反映して全文を残す。
    const image = await page.locator(".image-root").screenshot({ type: "png", animations: "disabled" });
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
    throw new Error(
      "formatsにはjson、markdown、text、html、png、simple-html、simple-pngのいずれかを指定してください",
    );
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
  let simpleHtml: string | undefined;
  let simplePng: Buffer | undefined;
  for (const format of formats) {
    // 変更理由: 詳細版と簡易版を同じベース名で並べ、用途に応じて片方だけ保存できるようにする。
    const suffix = format === "simple-html" ? "simple.html" : format === "simple-png" ? "simple.png" : format;
    const filePath = path.join(directory, `${baseName}.${suffix}`);
    if (format === "json") {
      await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    } else if (format === "markdown") {
      await writeFile(filePath, `${formatDebateMarkdown(result)}\n`, "utf8");
    } else if (format === "text") {
      await writeFile(filePath, `${formatDebateText(result)}\n`, "utf8");
    } else if (format === "html") {
      html ??= renderDebateHtml(result);
      await writeFile(filePath, html, "utf8");
    } else if (format === "png") {
      html ??= renderDebateHtml(result);
      png ??= await renderDebatePng(html);
      await writeFile(filePath, png);
    } else if (format === "simple-html") {
      simpleHtml ??= renderSimpleDebateHtml(result);
      await writeFile(filePath, simpleHtml, "utf8");
    } else {
      simpleHtml ??= renderSimpleDebateHtml(result);
      simplePng ??= await renderDebatePng(simpleHtml);
      await writeFile(filePath, simplePng);
    }
    files.push({ format, path: filePath });
  }
  return { directory, files };
}
