import { normalizeMessageImageTags } from "../parser/MessageParser";
import { normalizeObfuscatedUrl } from "../url/text";
import type { ReplacementRule, ReplacementTarget } from "./model";

const TARGET_FIELDS = {
  name: ["name"],
  mail: ["mail"],
  date: ["other"],
  body: ["message"],
  all: ["name", "mail", "other", "message"],
} as const;

export function escapeReplacementPattern(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function removeLines(value: string, source: string, firstOnly: boolean, protocol: string): string {
  const lines = value.split(/(\r\n|\n|<br\s*\/?\s*>)/giu);
  // 区切りを保持し、削除する行の直後（末尾なら直前）の区切りだけを取り除く。
  // 後ろから処理すると連続する削除対象でも残る行の区切りを壊さない。
  for (let index = firstOnly ? 0 : lines.length - 1; index >= 0; index -= 2) {
    // DATは行端の空白とimgタグを保持するため、表示上の画像URLでも指定できるようにする。
    // 残す行は元のHTMLのまま保ち、削除した画像は後続のサムネイル抽出にも渡さない。
    const line = lines[index].trim();
    const imageUrl = normalizeMessageImageTags(line, protocol).trim();
    if (
      lines[index] !== source &&
      line !== source &&
      normalizeObfuscatedUrl(imageUrl, protocol) !== source
    )
      continue;
    if (index + 1 < lines.length) lines.splice(index, 2);
    else if (index > 0) lines.splice(index - 1, 2);
    else lines.splice(index, 1);
  }
  return lines.join("");
}

/** 正規表現はレスごとに再生成せず、設定が変わったときだけコンパイルする。 */
export function createReplacementEngine(rules: readonly ReplacementRule[]) {
  const compiled = rules.map((rule) => ({
    rule,
    pattern:
      rule.operation === "replace"
        ? new RegExp(
            rule.matcher.kind === "literal"
              ? escapeReplacementPattern(rule.matcher.source)
              : rule.matcher.source,
            rule.matcher.flags ?? "g",
          )
        : null,
    conditions: rule.conditions.map((condition) => ({
      ...condition,
      pattern: condition.operator === "regex" ? new RegExp(condition.value) : null,
    })),
  }));

  return {
    apply<T extends ReplacementTarget>(this: void, url: string, title: string, target: T): T {
      const result = { ...target };
      const protocol = /^https?:/iu.exec(url)?.[0] ?? "https:";
      for (const { rule, pattern, conditions } of compiled) {
        if (
          !conditions.every((condition) => {
            const value = condition.field === "url" ? url : title;
            const matches =
              condition.operator === "contains"
                ? value.includes(condition.value)
                : condition.operator === "equals"
                  ? value === condition.value
                  : condition.pattern!.test(value);
            return condition.negate ? !matches : matches;
          })
        )
          continue;

        for (const field of TARGET_FIELDS[rule.target]) {
          if (rule.operation === "remove") {
            result[field] = removeLines(
              result[field],
              rule.matcher.source,
              rule.firstOnly ?? false,
              protocol,
            );
          } else {
            // yのみの正規表現も次の項目・レスへ検索位置を持ち越さないようにする。
            pattern!.lastIndex = 0;
            // リテラル置換のtoは$1/$&等も文字として扱い、キャプチャ展開はregexだけにする。
            result[field] =
              rule.matcher.kind === "literal"
                ? result[field].replace(pattern!, () => rule.replacement)
                : result[field].replace(pattern!, rule.replacement);
          }
        }
      }
      return result;
    },
  };
}
