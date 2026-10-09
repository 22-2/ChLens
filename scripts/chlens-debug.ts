/**
 * 起動中のTauri版ChLensへCDPで接続し、画面内の状態とログを取り出すCLI。
 *
 * 変更理由: Tauri版の不具合は利用者の画面でしか再現しないことが多く、DevToolsを開いて
 * 手で確認してもらうと往復が増えていた。WebView2のリモートデバッグ接続を使い、
 * `window.__chlensDebug` の結果をJSONで標準出力へ返して、エージェントやシェルから直接読めるようにする。
 *
 * 使い方は `pnpm debug:tauri help` を参照。
 */

const DEFAULT_PORT = 9222;
const REQUEST_TIMEOUT_MS = 15_000;

const TARGET_URL_PATTERNS: Record<string, string> = {
  main: "/view/index.html",
  overlay: "/view/comment-overlay.html",
  replay: "/view/archive-replay.html",
};

interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface CliOptions {
  command: string;
  positionals: string[];
  flags: Map<string, string>;
}

const HELP = `ChLens Tauri デバッグCLI

使い方:
  pnpm debug:tauri <command> [options]

commands:
  targets                       接続できる画面の一覧
  state [--key <name>]          画面内の状態（タブ・スレッド・実況）。--key で1項目だけ
  logs [--limit N] [--level L] [--category C] [--since 10m]
                                直近のログ。level: error|warn|info|log|event
  clear-logs                    ログのリングバッファを空にする
  eval <expression>             画面内でJavaScriptの式を評価する
  help                          この説明

options:
  --port <number>               CDPのポート（既定: 環境変数 CHLENS_CDP_PORT か ${DEFAULT_PORT}）
  --target main|overlay|replay  接続先の画面（既定: main）

事前準備:
  pnpm dev:tauri:debug でリモートデバッグを有効にして起動する。
  インストール版では WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=${DEFAULT_PORT}
  を設定したシェルから起動する。`;

function parseArgs(argv: string[]): CliOptions {
  const [command = "help", ...rest] = argv;
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const [name, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags.set(name, inlineValue);
      continue;
    }
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`--${name} に値がありません`);
    }
    flags.set(name, next);
    i++;
  }
  return { command, positionals, flags };
}

function parsePort(flags: Map<string, string>): number {
  const raw = flags.get("port") ?? process.env.CHLENS_CDP_PORT ?? String(DEFAULT_PORT);
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`ポート番号が不正です: ${raw}`);
  }
  return port;
}

/** "10m" "30s" "2h" を現在時刻からの epoch ms へ変換する。 */
function parseSince(value: string, now = Date.now()): number {
  const match = /^(\d+)(s|m|h)$/.exec(value);
  if (!match) throw new Error(`--since は 30s / 10m / 2h の形式で指定してください: ${value}`);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000 }[match[2] as "s" | "m" | "h"];
  return now - Number(match[1]) * unitMs;
}

async function listTargets(port: number): Promise<CdpTarget[]> {
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    throw new Error(
      `CDP (127.0.0.1:${port}) に接続できません。ChLensを pnpm dev:tauri:debug で起動しているか確認してください`,
      { cause: error },
    );
  }
  if (!response.ok) throw new Error(`CDPの一覧取得に失敗しました (HTTP ${response.status})`);
  return (await response.json()) as CdpTarget[];
}

function selectTarget(targets: CdpTarget[], name: string): CdpTarget {
  const pattern = TARGET_URL_PATTERNS[name];
  if (!pattern) {
    throw new Error(
      `--target は ${Object.keys(TARGET_URL_PATTERNS).join("|")} のどれかです: ${name}`,
    );
  }
  const target = targets.find(
    (candidate) =>
      candidate.type === "page" &&
      candidate.url.includes(pattern) &&
      candidate.webSocketDebuggerUrl,
  );
  if (!target) {
    const urls = targets.map((candidate) => `  ${candidate.type} ${candidate.url}`).join("\n");
    throw new Error(`画面 "${name}" が見つかりません。接続できる画面:\n${urls || "  (なし)"}`);
  }
  return target;
}

interface EvaluateResponse {
  id: number;
  result?: {
    result: { type: string; value?: unknown; description?: string };
    exceptionDetails?: { text: string; exception?: { description?: string } };
  };
  error?: { message: string };
}

async function evaluate(target: CdpTarget, expression: string): Promise<unknown> {
  const socket = new WebSocket(target.webSocketDebuggerUrl!);
  try {
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("CDPのWebSocket接続に失敗しました")),
        {
          once: true,
        },
      );
    });

    const response = await new Promise<EvaluateResponse>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("CDPの応答がタイムアウトしました")),
        REQUEST_TIMEOUT_MS,
      );
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as EvaluateResponse;
        if (message.id !== 1) return;
        clearTimeout(timer);
        resolve(message);
      });
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );
    });

    if (response.error) throw new Error(`CDPエラー: ${response.error.message}`);
    const details = response.result?.exceptionDetails;
    if (details) {
      throw new Error(
        `画面内で例外が発生しました: ${details.exception?.description ?? details.text}`,
      );
    }
    const result = response.result?.result;
    return result?.value ?? result?.description;
  } finally {
    socket.close();
  }
}

function callDebugApi(call: string): string {
  // 旧ビルドではAPIが無いため、未定義エラーではなく原因が分かる例外にする。
  return `(() => {
    const api = window.__chlensDebug;
    if (!api) throw new Error("window.__chlensDebug がありません。デバッグAPIを含むビルドで起動してください");
    return api.${call};
  })()`;
}

function buildExpression({ command, positionals, flags }: CliOptions): string {
  switch (command) {
    case "state": {
      const key = flags.get("key");
      return key == null
        ? callDebugApi("state()")
        : callDebugApi(`state()[${JSON.stringify(key)}] ?? null`);
    }
    case "logs": {
      const limit = flags.get("limit");
      const since = flags.get("since");
      const query = {
        limit: limit == null ? undefined : Number(limit),
        level: flags.get("level"),
        category: flags.get("category"),
        since: since == null ? undefined : parseSince(since),
      };
      return callDebugApi(`logs(${JSON.stringify(query)})`);
    }
    case "clear-logs":
      return callDebugApi("clearLogs()");
    case "eval": {
      const expression = positionals.join(" ");
      if (!expression) throw new Error("eval には評価する式を指定してください");
      return expression;
    }
    default:
      throw new Error(`不明なコマンドです: ${command}\n\n${HELP}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "help") {
    console.log(HELP);
    return;
  }

  const port = parsePort(options.flags);
  const targets = await listTargets(port);
  if (options.command === "targets") {
    console.log(
      JSON.stringify(
        targets.map(({ id, type, title, url }) => ({ id, type, title, url })),
        null,
        2,
      ),
    );
    return;
  }

  const target = selectTarget(targets, options.flags.get("target") ?? "main");
  const value = await evaluate(target, buildExpression(options));
  console.log(JSON.stringify(value ?? null, null, 2));
}

main().catch((error: unknown) => {
  console.error("[chlens-debug]", error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) console.error("  原因:", error.cause);
  process.exitCode = 1;
});
