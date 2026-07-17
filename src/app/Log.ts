import { deepCopy } from "src/app/Util";

type logLevel = "log" | "debug" | "info" | "warn" | "error";
const logLevels: ReadonlySet<logLevel> = new Set(<logLevel[]>[
  "log",
  "debug",
  "info",
  "warn",
  "error",
]);

export async function criticalError(message: string) {
  new Notification("深刻なエラーが発生したのでread.crxを終了します", {
    body: `詳細 : ${message}`,
  });

  const { id } = await (
    parent as unknown as {
      browser: {
        tabs: {
          getCurrent: () => Promise<{ id: number }>;
          remove: (id: number) => Promise<void>;
        };
      };
    }
  ).browser.tabs.getCurrent();
  void (
    parent as unknown as {
      browser: {
        tabs: {
          getCurrent: () => Promise<{ id: number }>;
          remove: (id: number) => Promise<void>;
        };
      };
    }
  ).browser.tabs.remove(id);
}

export function log(level: logLevel, ...data: unknown[]) {
  if (!logLevels.has(level)) {
    log("error", "app.log: 引数levelが不正な値です", level);
    return;
  }

  console[level](...data);
}

// [Val, Type, isNullable]
type Assertion = [unknown, string, boolean] | [unknown, string];

export function assertArg(name: string, rules: Assertion[]): boolean {
  let isError = false;
  for (const [val, type, canbeNull] of rules) {
    if (
      !(canbeNull && (val === null || val === void 0)) &&
      typeof val !== type
    ) {
      log(
        "error",
        `${name}: 不正な引数(予期していた型: ${type}, 受け取った型: ${typeof val})`,
        deepCopy(val),
      );
      isError = true;
    }
  }
  return isError;
}
