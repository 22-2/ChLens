export interface ReplaceStrRule {
  type: string;
  place: string;
  before: string;
  after: string;
  urlPattern?: number;
  url?: string;
  beforeReg?: RegExp;
}

export interface ReplaceStrTarget {
  name: string;
  mail: string;
  other: string;
  message: string;
  [key: string]: string;
}

const URL_PATTERN = {
  CONTAIN: 0,
  DONTCONTAIN: 1,
  MATCH: 2,
  DONTMATCH: 3,
  REGEX: 4,
  DONTREGEX: 5,
};

const PLACE_MAP: Record<string, keyof ReplaceStrTarget> = {
  name: "name",
  mail: "mail",
  date: "other",
  msg: "message",
};

export class ReplaceStrParser {
  static parse(text: string): ReplaceStrRule[] {
    const rules: ReplaceStrRule[] = [];
    if (!text) return rules;

    const lines = text.split("\n");
    for (const line of lines) {
      if (!line || ["//", ";", "'"].some((prefix) => line.startsWith(prefix))) {
        continue;
      }

      const match =
        /(?:<(\w{2,3})>)?(.*)\t(.+)\t(name|mail|date|msg|all)(?:\t(?:<(\d)>)?(.+))?/.exec(line);
      if (!match) continue;

      const rule: ReplaceStrRule = {
        type: match[1] || "ex",
        place: match[4] || "all",
        before: match[2],
        after: match[3],
        urlPattern: match[5] ? parseInt(match[5], 10) : undefined,
        url: match[6],
      };

      if (rule.type === "") rule.type = "rx";
      if (rule.url && rule.urlPattern === undefined) rule.urlPattern = 0;

      // Prepare regex
      try {
        rule.beforeReg = this.prepareBeforeReg(rule);
      } catch {
        // 不正な正規のルールは無視して残りを処理継続する。失敗情報は現仕様では握り潰す。
        continue;
      }

      rules.push(rule);
    }
    return rules;
  }

  private static prepareBeforeReg(rule: ReplaceStrRule): RegExp {
    switch (rule.type) {
      case "rx":
        return new RegExp(rule.before, "g");
      case "rx2":
        return new RegExp(rule.before, "ig");
      case "ex":
        return new RegExp(rule.before.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "ig");
      default:
        throw new Error("Unknown type");
    }
  }

  static replace(
    url: string,
    title: string,
    target: ReplaceStrTarget,
    rules: ReplaceStrRule[],
  ): ReplaceStrTarget {
    let result = { ...target };

    for (const rule of rules) {
      if (rule.url) {
        let flag = false;
        if (
          rule.urlPattern === URL_PATTERN.CONTAIN ||
          rule.urlPattern === URL_PATTERN.DONTCONTAIN
        ) {
          flag = url.includes(rule.url) || title.includes(rule.url);
        } else if (
          rule.urlPattern === URL_PATTERN.MATCH ||
          rule.urlPattern === URL_PATTERN.DONTMATCH
        ) {
          flag = url === rule.url || title === rule.url;
        } else if (
          rule.urlPattern === URL_PATTERN.REGEX ||
          rule.urlPattern === URL_PATTERN.DONTREGEX
        ) {
          const reg = new RegExp(rule.url);
          flag = reg.test(url) || reg.test(title);
        }

        if (
          rule.urlPattern === URL_PATTERN.DONTCONTAIN ||
          rule.urlPattern === URL_PATTERN.DONTMATCH ||
          rule.urlPattern === URL_PATTERN.DONTREGEX
        ) {
          flag = !flag;
        }

        if (!flag) continue;
      }

      if (rule.type === "ex2") {
        // Simple string replacement (case-insensitive literal)
        // Note: original code used app.replaceAll which might be custom
        // We use a safe implementation here
        const safeBefore = rule.before.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
        const reg = new RegExp(safeBefore, "ig");

        if (rule.place === "all") {
          result.name = result.name.replace(reg, rule.after);
          result.mail = result.mail.replace(reg, rule.after);
          result.other = result.other.replace(reg, rule.after);
          result.message = result.message.replace(reg, rule.after);
        } else {
          const p = PLACE_MAP[rule.place];
          if (p) result[p] = result[p].replace(reg, rule.after);
        }
      } else if (rule.beforeReg) {
        if (rule.place === "all") {
          result.name = result.name.replace(rule.beforeReg, rule.after);
          result.mail = result.mail.replace(rule.beforeReg, rule.after);
          result.other = result.other.replace(rule.beforeReg, rule.after);
          result.message = result.message.replace(rule.beforeReg, rule.after);
        } else {
          const p = PLACE_MAP[rule.place];
          if (p) result[p] = result[p].replace(rule.beforeReg, rule.after);
        }
      }
    }

    return result;
  }
}
