import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";

import {
  getWaitingIssueNumbers,
  hashTriageSource,
  mergeReviewedSourceHashes,
  readQueueProgress,
  type TriageQueueProgress,
  type TriageQueueStateLike,
  type TriageRunMode,
} from "./triage-todo-queue.ts";

type TriageAction = "create" | "retriage" | "review-existing" | "skip";
type CloseReason = "completed" | "not planned" | "duplicate" | "none";
type RunMode = TriageRunMode;

interface TriageItem {
  source_text: string;
  action: TriageAction;
  confidence: "high" | "medium" | "low";
  title: string;
  body: string;
  labels: string[];
  duplicate_issue_numbers: number[];
  existing_issue_numbers: number[];
  close_reason: CloseReason;
  unclear_questions: string[];
  reason: string;
}

interface TriageReport {
  items: TriageItem[];
  has_more_unreviewed_items: boolean;
  remaining_count: number;
}

interface TriageState extends TriageQueueStateLike {
  version?: number;
  mode: RunMode;
  todo_hash: string;
  issues_hash: string;
  last_run_at: string;
  reviewed_source_hashes?: string[];
  has_more_unreviewed_items?: boolean;
  remaining_count?: number;
  waiting_issue_numbers?: number[];
}

interface IssueLabel {
  name: string;
}

interface IssueSnapshotItem {
  number: number;
  state: "OPEN" | "CLOSED";
  labels: IssueLabel[];
  updatedAt: string;
}

const root = process.cwd();
const todoPath = path.join(root, ".todo");
const schemaPath = path.join(root, "scripts", "triage-todo.schema.json");
const outputDir = path.join(root, "debug", "triage");
const outputPath = path.join(outputDir, "todo-triage.json");
const codexLogPath = path.join(outputDir, "codex.log");
const statePath = path.join(outputDir, "state.json");
const lockPath = path.join(outputDir, "triage.lock");
const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
const mode: RunMode = apply ? "apply" : "dry-run";
// 情報不足のメモも独立したIssueとして後から補足できるよう、作成時の待機ラベルとして許可する。
// 集約Issueにまとめると別の不満と文脈が混ざり、検索・参照とトークン消費の両方が増えるため。
const CREATE_LABELS = new Set(["needs-priority", "needs-info"]);
const AI_DISCLOSURE =
  "> 🤖 このIssueは、`.todo`のメモをもとにAIがコード調査・整理して作成しました。\n> 内容、優先度、仕様、完了判定は人が確認します。";

function withAiDisclosure(body: string): string {
  let normalizedBody = body.trimEnd();
  // Codex may include the repository-mandated disclosure itself, so remove trailing copies before adding the canonical one.
  while (normalizedBody.endsWith(AI_DISCLOSURE)) {
    normalizedBody = normalizedBody.slice(0, -AI_DISCLOSURE.length).trimEnd();
  }
  return `${normalizedBody}\n\n${AI_DISCLOSURE}`;
}

// Codexのサンドボックスからユーザー領域のgh設定を直接読ませないため、
// GitHub CLIの設定ディレクトリだけをワークスペース内に分離する。
// 認証トークンはGITHUB_TOKEN環境変数から受け取り、資格情報ファイルはコピーしない。
const ghConfigDir = path.join(outputDir, "gh-config");
fs.mkdirSync(ghConfigDir, { recursive: true });
process.env.GH_CONFIG_DIR = ghConfigDir;

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string): void {
  console.error(`[triage-todo] ${message}`);
  process.exitCode = 1;
}

function readJsonc<T>(text: string, sourceName: string): T {
  const errors: ParseError[] = [];
  const value = parseJsonc(text, errors, { allowTrailingComma: true }) as T;
  if (errors.length > 0) {
    const details = errors
      .map((error) => `${printParseErrorCode(error.error)} at ${error.offset}`)
      .join(", ");
    throw new Error(`${sourceName}: ${details}`);
  }
  return value;
}

function hash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function releaseLock(): void {
  try {
    const lock = readJsonc<{ pid?: number }>(fs.readFileSync(lockPath, "utf8"), lockPath);
    if (lock.pid === process.pid) fs.unlinkSync(lockPath);
  } catch {
    // A missing or already-cleaned lock is safe during process shutdown.
  }
}

function acquireLock(): void {
  const content = `${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })}\n`;
  try {
    const descriptor = fs.openSync(lockPath, "wx");
    fs.writeFileSync(descriptor, content, "utf8");
    fs.closeSync(descriptor);
    process.on("exit", releaseLock);
    return;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
      throw error;
    }
  }

  try {
    const lock = readJsonc<{ pid?: number }>(fs.readFileSync(lockPath, "utf8"), lockPath);
    if (lock.pid && isProcessRunning(lock.pid)) {
      console.log(`[triage-todo] another run is active (pid ${lock.pid}); skipping`);
      process.exit(0);
    }
  } catch {
    // A partially written or stale lock can be replaced below.
  }

  fs.unlinkSync(lockPath);
  acquireLock();
}

function getIssueSnapshot(): string {
  return run("gh", [
    "issue",
    "list",
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,state,labels,updatedAt",
  ]);
}

function getRetriageIssueNumbers(issueSnapshot: string): number[] {
  const issues = readJsonc<IssueSnapshotItem[]>(issueSnapshot, "gh issue list output");
  const protectedWorkflowLabels = new Set(["ready", "in-progress", "needs-human-test", "blocked"]);
  return issues
    .filter(
      (issue) =>
        issue.state === "OPEN" &&
        issue.labels.some((label) => label.name === "needs-retriage") &&
        !issue.labels.some((label) => protectedWorkflowLabels.has(label.name)),
    )
    .map((issue) => issue.number);
}

function readState(): TriageState | undefined {
  if (!fs.existsSync(statePath)) return undefined;
  try {
    return readJsonc<TriageState>(fs.readFileSync(statePath, "utf8"), statePath);
  } catch (error) {
    console.warn(`[triage-todo] ignoring invalid state file: ${errorMessage(error)}`);
    return undefined;
  }
}

function writeState(
  todoContent: string,
  issueSnapshot: string,
  queueProgress: TriageQueueProgress,
): void {
  fs.writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        version: 2,
        mode,
        todo_hash: hash(todoContent),
        issues_hash: hash(issueSnapshot),
        last_run_at: new Date().toISOString(),
        reviewed_source_hashes: queueProgress.reviewedSourceHashes,
        has_more_unreviewed_items: queueProgress.hasMoreUnreviewedItems,
        remaining_count: queueProgress.remainingCount,
        waiting_issue_numbers: queueProgress.waitingIssueNumbers,
      } satisfies TriageState,
      null,
      2,
    )}\n`,
    "utf8",
  );
}

if (process.argv.includes("--help")) {
  console.log("Usage: pnpm triage:todo [--apply] [--force]");
  console.log("  default       Analyze .todo and write a dry-run report");
  console.log("  --apply       Create up to three issues and mark successful items");
  console.log("  --force       Ignore the unchanged-input state and run again");
  process.exit(0);
}

if (!fs.existsSync(todoPath)) {
  fail(".todo was not found");
  process.exit();
}

const todo = fs.readFileSync(todoPath, "utf8");
fs.mkdirSync(outputDir, { recursive: true });
acquireLock();

// Issueのstate・label・updatedAtも入力として扱うことで、既存Issueの進捗変化を検知し、
// linked Issueに対するreview-existingの再確認を定期実行できるようにする。
const issueSnapshot = getIssueSnapshot();
const retriageIssueNumbers = getRetriageIssueNumbers(issueSnapshot);
const previousState = readState();
const issueSnapshotItems = readJsonc<IssueSnapshotItem[]>(issueSnapshot, "gh issue list output");
const queueProgress = readQueueProgress(previousState, mode, force);
const waitingIssueNumbers = getWaitingIssueNumbers(
  issueSnapshotItems,
  queueProgress.waitingIssueNumbers,
);
const normalTriageEnabled = force || waitingIssueNumbers.length === 0;

// 前バッチで作成したIssueの判断が終わるまで新しいIssueを増やさず、待機理由と残件をログへ明示する。
if (!normalTriageEnabled && retriageIssueNumbers.length === 0) {
  writeState(todo, issueSnapshot, {
    ...queueProgress,
    waitingIssueNumbers,
  });
  console.log(
    `[triage-todo] triage paused: #${waitingIssueNumbers.join(", #")} await human priority or information`,
  );
  console.log(`[triage-todo] .todo backlog: ${queueProgress.remainingCount} unreviewed items`);
  process.exit(0);
}

// dry-runの確認後にapplyへ移る場合は、入力が同じでも実行目的が異なるため再評価する。
// 未処理キューが空で、同じモードの入力とIssue状態も変わらない場合だけCodexを省略する。
if (
  !force &&
  !queueProgress.hasMoreUnreviewedItems &&
  previousState?.mode === mode &&
  previousState.todo_hash === hash(todo) &&
  previousState.issues_hash === hash(issueSnapshot)
) {
  console.log("[triage-todo] .todo and GitHub Issues are unchanged; skipping Codex");
  process.exit(0);
}

const todoLines = todo.split(/\r?\n/);
const reviewedSourceHashSet = new Set(queueProgress.reviewedSourceHashes);
const alreadyReviewedSourceTexts = [
  ...new Set(todoLines.filter((line) => reviewedSourceHashSet.has(hashTriageSource(line)))),
];

const prompt = `
You are the read.crx-2 todo triage agent.

Read the repository instructions, .todo, related source files, tests, and existing GitHub Issues.
The user's .todo input is intentionally free-form. Preserve its wording and infer only what the
repository or the text supports.

Return JSON matching scripts/triage-todo.schema.json.

Rules:
- Normal .todo triage is ${normalTriageEnabled ? "enabled" : "paused while the previous batch awaits human review"}.
- When normal triage is paused, do not return create or normal skip items. Only
  return retriage or review-existing items that require work because their linked Issue changed.
- When normal triage is enabled, ignore lines listed in <already-reviewed> unless their linked Issue
  now requires review-existing. Select the next coherent user-problem units from the remaining text.
- Treat lines beginning with "- [-]" as explicitly deferred or rejected by the user. Do not return
  them as normal triage items and do not include them in remaining_count.
- For items without an HTML comment matching "issue: #number", perform normal triage and consider
  create or skip. Every independently understandable .todo item may become one individual Issue,
  even when its intent, specification, or reproduction details are still unclear.
- For items with an issue marker, inspect the linked Issue only. Never create a new Issue or append
  another unclear question for that item; use review-existing when the linked open Issue appears
  already fixed or no longer appropriate, otherwise use skip.
- Independently inspect every open Issue listed in <needs-retriage>. Read its body and comments,
  then compare the added information with the latest source and tests. Return action=retriage with
  that Issue number as the only existing_issue_numbers entry. source_text may be empty when no exact
  .todo line links to the Issue. Put the updated investigation in body as a comment-ready report.
- For action=retriage, labels must contain exactly one next-state label: needs-priority when the new
  information is sufficient for human prioritization, or needs-info when a concrete question still
  blocks a reliable specification. Do not retriage ready, in-progress, needs-human-test, or blocked
  Issues automatically; return skip for those workflow states.
- At the very beginning, list and inspect existing open and closed GitHub Issues. Search by title,
  body, and related terms before proposing a new one. Use gh read-only commands when needed.
- \`needs-priority\` means "already investigated; waiting for human priority". Do not implement or
  change those Issues, but do include them in duplicate checks so a second Issue is not created.
- Never modify files, create issues, edit issues, change labels, commit, or push.
- Return at most three items with action=create. Do not use a separate aggregate or unclear-item
  action. For an independently understandable item whose intent, specification, or reproduction
  details are insufficient, use action=create with the needs-info label and record the unanswered
  questions in the Issue body.
- Include every source line actually reviewed in items, including duplicate or non-actionable lines
  with action=skip, so unchanged lines are not repeatedly analyzed in later batches.
- Set has_more_unreviewed_items when normal .todo items remain outside this batch. Set
  remaining_count to the number of those remaining items, or zero when the backlog is exhausted.
- Use action=skip for an item that is already represented by an existing issue or is not actionable.
- Use action=review-existing when an open Issue appears already fixed or no longer appropriate.
  Include existing_issue_numbers and set close_reason to completed or not planned. Do not close it.
- For a closed matching Issue, use action=skip unless there is clear evidence that it should be
  reopened; do not create a duplicate Issue.
- For action=create, use exactly one of the needs-priority or needs-info labels. Use needs-info when
  the item needs a human answer before its intent, specification, or reproduction can be confirmed.
  Do not use ready, in-progress,
  needs-human-test, blocked, or review-existing.
- source_text must exactly match one complete line from .todo, except that action=retriage may use
  an empty string when the labeled Issue has no linked .todo item.
- For action=create, body must contain: symptom, expected behavior, reproduction/observation,
  code investigation with file paths and evidence, confirmed facts vs hypotheses, proposal,
  completion criteria, risks, and the exact source text.
- Do not include the AI-authorship disclosure in body. The calling script appends it exactly once.
- Issue titles and bodies must be written in Japanese. Fixed workflow labels and other mechanical
  identifiers remain unchanged.
- If evidence is insufficient, do not invent a specification.

The current .todo content follows:

<todo>
${todo}
</todo>

<needs-retriage>
${retriageIssueNumbers.map((issueNumber) => `#${issueNumber}`).join("\n")}
</needs-retriage>

<already-reviewed>
${alreadyReviewedSourceTexts.join("\n")}
</already-reviewed>
`;

const codexArgs = [
  "exec",
  "--ephemeral",
  "--sandbox",
  "danger-full-access",
  "--output-schema",
  schemaPath,
  "-o",
  outputPath,
  prompt,
];

console.log(`[triage-todo] running ${apply ? "apply" : "dry-run"} analysis`);
const codex = spawnSync("codex", codexArgs, {
  cwd: root,
  // 最終JSONは-oで保存するためstdoutへ流さず、stderrはログファイルへ保存する。
  stdio: ["ignore", "ignore", "pipe"],
  shell: false,
});
fs.writeFileSync(codexLogPath, codex.stderr ?? "", "utf8");

if (codex.status !== 0) {
  const log = fs.readFileSync(codexLogPath, "utf8");
  console.error(log.slice(-4000));
  fail(`codex exec failed with exit code ${codex.status ?? "unknown"}`);
  process.exit();
}

let report: TriageReport;
try {
  report = readJsonc<TriageReport>(fs.readFileSync(outputPath, "utf8"), outputPath);
} catch (error) {
  fail(`could not parse ${path.relative(root, outputPath)}: ${errorMessage(error)}`);
  process.exit();
}

const reportHasRemainingItems = report.remaining_count > 0;
if (report.has_more_unreviewed_items !== reportHasRemainingItems) {
  fail("triage report backlog fields are inconsistent");
  process.exit();
}

const retriageIssueNumberSet = new Set(retriageIssueNumbers);
const validItems = report.items.filter((item) => {
  if (
    item.action === "retriage" &&
    item.existing_issue_numbers.length === 1 &&
    retriageIssueNumberSet.has(item.existing_issue_numbers[0])
  ) {
    return true;
  }
  if (todoLines.includes(item.source_text)) return true;
  console.warn(`[triage-todo] skipping source not found verbatim in .todo: ${item.source_text}`);
  return false;
});
// AIがアーカイブや過去の会話から項目を混ぜても、現在の.todoに存在する候補だけを扱う。
report.items = validItems;
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const createItems = validItems.filter((item) => item.action === "create");
const retriageItems = validItems.filter((item) => item.action === "retriage");
const reviewItems = validItems.filter((item) => item.action === "review-existing");
const issueMarkedSourceTexts = new Set(
  todoLines.filter(
    (_line, lineIndex) => todoLines[lineIndex + 1]?.includes("<!-- issue:") === true,
  ),
);
const reviewedNormalSourceTexts = normalTriageEnabled
  ? validItems
      .filter(
        (item) =>
          item.source_text.length > 0 &&
          item.action !== "retriage" &&
          item.action !== "review-existing" &&
          !issueMarkedSourceTexts.has(item.source_text),
      )
      .map((item) => item.source_text)
  : [];
let nextQueueProgress: TriageQueueProgress = {
  reviewedSourceHashes: mergeReviewedSourceHashes(
    queueProgress.reviewedSourceHashes,
    reviewedNormalSourceTexts,
  ),
  hasMoreUnreviewedItems: normalTriageEnabled
    ? report.has_more_unreviewed_items
    : queueProgress.hasMoreUnreviewedItems,
  remainingCount: normalTriageEnabled ? report.remaining_count : queueProgress.remainingCount,
  waitingIssueNumbers,
};

console.log(`[triage-todo] report: ${path.relative(root, outputPath)}`);
console.log(
  `[triage-todo] create=${createItems.length} retriage=${retriageItems.length} review-existing=${reviewItems.length}`,
);
console.log(
  `[triage-todo] .todo backlog: ${nextQueueProgress.remainingCount} unreviewed items (has-more=${nextQueueProgress.hasMoreUnreviewedItems})`,
);
for (const item of reviewItems) {
  console.log(
    `[triage-todo] human review required for #${item.existing_issue_numbers.join(", #")}: ${item.close_reason} (${item.source_text})`,
  );
}

if (!apply) {
  writeState(todo, getIssueSnapshot(), nextQueueProgress);
  console.log("[triage-todo] dry-run only; no Issue or .todo changes were made");
  process.exit(0);
}

if (!normalTriageEnabled && createItems.length > 0) {
  fail("normal triage items were returned while the previous batch awaits human review");
  process.exit();
}

if (createItems.length > 3) {
  fail(`refusing to create ${createItems.length} issues; the limit is three`);
  process.exit();
}

for (const item of retriageItems) {
  const issueNumber = item.existing_issue_numbers[0];
  if (item.labels.length !== 1 || !["needs-priority", "needs-info"].includes(item.labels[0])) {
    fail(`unsafe next-state label in retriage candidate: #${issueNumber}`);
    process.exit();
  }
}

for (const item of retriageItems) {
  const issueNumber = item.existing_issue_numbers[0];
  run("gh", ["issue", "comment", String(issueNumber), "--body", item.body]);
  // 再調査結果を残してから待機状態へ戻し、同じIssueが定期実行ごとに再処理されるのを防ぐ。
  run("gh", [
    "issue",
    "edit",
    String(issueNumber),
    "--remove-label",
    "needs-retriage,needs-priority,needs-info,review-existing",
    "--add-label",
    item.labels[0],
  ]);
  console.log(`[triage-todo] retriaged #${issueNumber}; next state=${item.labels[0]}`);
}

for (const item of reviewItems) {
  for (const issueNumber of item.existing_issue_numbers) {
    run("gh", ["issue", "edit", String(issueNumber), "--add-label", "review-existing"]);
    console.log(`[triage-todo] labeled #${issueNumber} as review-existing`);
  }
}

function appendTodoMarker(sourceText: string, issueNumber: number): void {
  const lines = fs.readFileSync(todoPath, "utf8").split(/\r?\n/);
  const index = lines.findIndex(
    (line, lineIndex) =>
      line === sourceText && lines[lineIndex + 1]?.includes("<!-- issue:") !== true,
  );
  if (index === -1) {
    throw new Error(`could not find an unmarked .todo source line: ${sourceText}`);
  }
  lines.splice(index + 1, 0, `  <!-- issue: #${issueNumber} -->`);
  fs.writeFileSync(todoPath, lines.join("\n"), "utf8");
}

const createdIssueNumbers: number[] = [];
for (const item of createItems) {
  if (item.duplicate_issue_numbers.length > 0) {
    console.log(
      `[triage-todo] skipped duplicate candidate: ${item.source_text} (#${item.duplicate_issue_numbers.join(", #")})`,
    );
    continue;
  }
  const createLabel = item.labels[0] ?? "";
  if (item.labels.length !== 1 || !CREATE_LABELS.has(createLabel)) {
    fail(`unsafe label in create candidate: ${item.title}`);
    process.exit();
  }
  const issueUrl = run("gh", [
    "issue",
    "create",
    "--title",
    item.title,
    "--body",
    withAiDisclosure(item.body),
    "--label",
    createLabel,
  ]);
  const match = issueUrl.match(/\/issues\/(\d+)(?:$|\s)/);
  if (!match) {
    fail(`gh issue create returned an unexpected URL: ${issueUrl}`);
    process.exit();
  }
  const issueNumber = Number(match[1]);
  appendTodoMarker(item.source_text, issueNumber);
  createdIssueNumbers.push(issueNumber);
  console.log(`[triage-todo] created ${issueUrl}`);
}

nextQueueProgress = {
  ...nextQueueProgress,
  waitingIssueNumbers: createdIssueNumbers.length > 0 ? createdIssueNumbers : waitingIssueNumbers,
};
writeState(fs.readFileSync(todoPath, "utf8"), getIssueSnapshot(), nextQueueProgress);
if (createdIssueNumbers.length > 0) {
  console.log(
    `[triage-todo] triage paused until human decisions for #${createdIssueNumbers.join(", #")}`,
  );
} else if (nextQueueProgress.hasMoreUnreviewedItems) {
  console.log("[triage-todo] next .todo batch will run on the next scheduled invocation");
}
