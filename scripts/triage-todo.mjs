import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";

const root = process.cwd();
const todoPath = path.join(root, ".todo");
const schemaPath = path.join(root, "scripts", "triage-todo.schema.json");
const outputDir = path.join(root, "debug", "triage");
const outputPath = path.join(outputDir, "todo-triage.json");
const codexLogPath = path.join(outputDir, "codex.log");
const apply = process.argv.includes("--apply");

// Codexのサンドボックスからユーザー領域のgh設定を直接読ませないため、
// GitHub CLIの設定ディレクトリだけをワークスペース内に分離する。
// 認証トークンはGITHUB_TOKEN環境変数から受け取り、資格情報ファイルはコピーしない。
const ghConfigDir = path.join(outputDir, "gh-config");
fs.mkdirSync(ghConfigDir, { recursive: true });
process.env.GH_CONFIG_DIR = ghConfigDir;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function fail(message) {
  console.error(`[triage-todo] ${message}`);
  process.exitCode = 1;
}

function readJsonc(text, sourceName) {
  const errors = [];
  const value = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const details = errors
      .map((error) => `${printParseErrorCode(error.error)} at ${error.offset}`)
      .join(", ");
    throw new Error(`${sourceName}: ${details}`);
  }
  return value;
}

if (process.argv.includes("--help")) {
  console.log("Usage: pnpm triage:todo [--apply]");
  console.log("  default       Analyze .todo and write a dry-run report");
  console.log("  --apply       Create up to three issues and mark successful items");
  process.exit(0);
}

if (!fs.existsSync(todoPath)) {
  fail(".todo was not found");
  process.exit();
}

const todo = fs.readFileSync(todoPath, "utf8");
fs.mkdirSync(outputDir, { recursive: true });

const prompt = `
You are the read.crx-2 todo triage agent.

Read the repository instructions, .todo, related source files, tests, and existing GitHub Issues.
The user's .todo input is intentionally free-form. Preserve its wording and infer only what the
repository or the text supports.

Return JSON matching scripts/triage-todo.schema.json.

Rules:
- Process only actionable items from .todo that do not already contain an HTML comment matching
  "issue: #number".
- Search existing GitHub Issues before proposing a new one. Use gh read-only commands when needed.
- Never modify files, create issues, edit issues, change labels, commit, or push.
- Return at most three items with action=create. Include append-unclear items separately when the
  intent cannot be determined from the text and repository evidence.
- Use action=skip for an item that is already represented by an existing issue or is not actionable.
- Use action=append-unclear for an item that needs a human answer. Its title must be
  "[triage] Unclear todo items" and unclear_questions must contain concise questions.
- For action=create, use the needs-priority label only. Do not use ready, in-progress,
  needs-human-test, blocked, or done.
- source_text must exactly match one complete line from .todo.
- For action=create, body must contain: symptom, expected behavior, reproduction/observation,
  code investigation with file paths and evidence, confirmed facts vs hypotheses, proposal,
  completion criteria, risks, and the exact source text.
- For action=append-unclear, body should contain the source text and the questions to answer.
- If evidence is insufficient, do not invent a specification.

The current .todo content follows:

<todo>
${todo}
</todo>
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

let report;
try {
  report = readJsonc(fs.readFileSync(outputPath, "utf8"), outputPath);
} catch (error) {
  fail(`could not parse ${path.relative(root, outputPath)}: ${error.message}`);
  process.exit();
}

const todoLines = todo.split(/\r?\n/);
const validItems = report.items.filter((item) => {
  if (todoLines.includes(item.source_text)) return true;
  console.warn(`[triage-todo] skipping source not found verbatim in .todo: ${item.source_text}`);
  return false;
});
// AIがアーカイブや過去の会話から項目を混ぜても、現在の.todoに存在する候補だけを扱う。
report.items = validItems;
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const createItems = validItems.filter((item) => item.action === "create");
const unclearItems = validItems.filter((item) => item.action === "append-unclear");

console.log(`[triage-todo] report: ${path.relative(root, outputPath)}`);
console.log(`[triage-todo] create=${createItems.length} unclear=${unclearItems.length}`);

if (!apply) {
  console.log("[triage-todo] dry-run only; no Issue or .todo changes were made");
  process.exit(0);
}

if (createItems.length > 3) {
  fail(`refusing to create ${createItems.length} issues; the limit is three`);
  process.exit();
}

function findUnclearIssue() {
  const result = run("gh", [
    "issue",
    "list",
    "--state",
    "open",
    "--search",
    '"[triage] Unclear todo items" in:title',
    "--json",
    "number,title",
    "--limit",
    "10",
  ]);
  const issues = result ? readJsonc(result, "gh issue list output") : [];
  return issues.find((issue) => issue.title === "[triage] Unclear todo items");
}

function appendTodoMarker(sourceText, issueNumber) {
  const lines = fs.readFileSync(todoPath, "utf8").split(/\r?\n/);
  const index = lines.findIndex(
    (line, lineIndex) =>
      line === sourceText &&
      lines[lineIndex + 1]?.includes("<!-- issue:") !== true,
  );
  if (index === -1) {
    throw new Error(`could not find an unmarked .todo source line: ${sourceText}`);
  }
  lines.splice(index + 1, 0, `  <!-- issue: #${issueNumber} -->`);
  fs.writeFileSync(todoPath, lines.join("\n"), "utf8");
}

for (const item of createItems) {
  if (item.duplicate_issue_numbers.length > 0) {
    console.log(
      `[triage-todo] skipped duplicate candidate: ${item.source_text} (#${item.duplicate_issue_numbers.join(", #")})`,
    );
    continue;
  }
  if (item.labels.some((label) => label !== "needs-priority")) {
    fail(`unsafe label in create candidate: ${item.title}`);
    process.exit();
  }
  const issueUrl = run("gh", [
    "issue",
    "create",
    "--title",
    item.title,
    "--body",
    item.body,
    "--label",
    "needs-priority",
  ]);
  const match = issueUrl.match(/\/issues\/(\d+)(?:$|\s)/);
  if (!match) {
    fail(`gh issue create returned an unexpected URL: ${issueUrl}`);
    process.exit();
  }
  appendTodoMarker(item.source_text, Number(match[1]));
  console.log(`[triage-todo] created ${issueUrl}`);
}

if (unclearItems.length > 0) {
  const body = unclearItems
    .map(
      (item) =>
        `## ${item.source_text}\n\n${item.body}\n\nQuestions:\n${item.unclear_questions.map((question) => `- ${question}`).join("\n")}`,
    )
    .join("\n\n---\n\n");
  const existing = findUnclearIssue();
  let issueNumber = existing?.number;
  if (issueNumber) {
    run("gh", ["issue", "comment", String(issueNumber), "--body", body]);
    console.log(`[triage-todo] appended unclear items to #${issueNumber}`);
  } else {
    const issueUrl = run("gh", [
      "issue",
      "create",
      "--title",
      "[triage] Unclear todo items",
      "--body",
      body,
      "--label",
      "needs-info",
    ]);
    const match = issueUrl.match(/\/issues\/(\d+)(?:$|\s)/);
    if (!match) {
      fail(`gh issue create returned an unexpected URL: ${issueUrl}`);
      process.exit();
    }
    issueNumber = Number(match[1]);
    console.log(`[triage-todo] created unclear-items issue ${issueUrl}`);
  }

  // 集約Issueも元メモへ紐づけないと、次回の実行で同じ質問を再投稿する。
  for (const item of unclearItems) {
    appendTodoMarker(item.source_text, issueNumber);
  }
}
