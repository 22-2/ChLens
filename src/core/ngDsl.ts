export const NG_DSL_LANGUAGE_ID = "chlens-ngdsl";

import { TYPE, type NGType } from "src/core/NGTypes";

export const NG_HIGHLIGHT_COLOR_PRESETS = {
  yellow: "#ffeb3b",
  blue: "#e3f2fd",
  green: "#c8e6c9",
  red: "#ffcdd2",
  purple: "#e1bee7",
  orange: "#ffe0b2",
  pink: "#f8bbd0",
  cyan: "#b2ebf2",
  lime: "#f0f4c3",
  amber: "#ffecb3",
} as const;

export const NG_HIGHLIGHT_COLOR_PRESET_DESCRIPTIONS = {
  yellow: "黄色 (警告・注目)",
  blue: "青 (情報)",
  green: "緑 (成功・OK)",
  red: "赤 (重要・緊急)",
  purple: "紫 (特別)",
  orange: "オレンジ (注意)",
  pink: "ピンク (お気に入り)",
  cyan: "シアン (クール)",
  lime: "ライム (軽い注目)",
  amber: "アンバー (中程度の注意)",
} as const;

export type NgDslColorPresetName = keyof typeof NG_HIGHLIGHT_COLOR_PRESETS;

export const NG_HIGHLIGHT_COLOR_PRESET_ITEMS = Object.entries(NG_HIGHLIGHT_COLOR_PRESETS).map(
  ([name, hex]) => ({
    name: name as NgDslColorPresetName,
    hex,
    description:
      NG_HIGHLIGHT_COLOR_PRESET_DESCRIPTIONS[
        name as keyof typeof NG_HIGHLIGHT_COLOR_PRESET_DESCRIPTIONS
      ],
  }),
);

export type NGDslParameterName = "word" | "sites" | "bgColor" | "label" | "disabled";

export interface NGDslParameterSpec {
  readonly name: NGDslParameterName;
  readonly detail: string;
  readonly documentation: string;
}

export interface NGDslRuleSpec {
  readonly keyword: NGType;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly wordDescription: string;
  readonly parameters: readonly NGDslParameterSpec[];
}

const WORD_PARAMETER: NGDslParameterSpec = {
  name: "word",
  detail: "マッチ文字列",
  documentation: 'マッチさせる文字列または正規表現です。編集時は word="VTuber" のように書けます。',
};

const SITES_PARAMETER: NGDslParameterSpec = {
  name: "sites",
  detail: "適用サイト",
  documentation:
    "ドメインのみ (sites=5ch.io)、ドメイン+ボード (sites=5ch.io/livejupiter)、複数指定 (sites=[5ch.io/livejupiter, eddibb.cc]) の形で指定します。* は全体適用なので通常は省略できます。",
};

const BGCOLOR_PARAMETER: NGDslParameterSpec = {
  name: "bgColor",
  detail: "ハイライト背景色",
  documentation:
    "予約色または #rrggbb を指定します。予約色は yellow, blue, green, red, purple, orange, pink, cyan, lime, amber です。",
};

const LABEL_PARAMETER: NGDslParameterSpec = {
  name: "label",
  detail: "ハイライトラベル",
  documentation: "スレ一覧上に表示する短いラベルです。",
};

const DISABLED_PARAMETER: NGDslParameterSpec = {
  name: "disabled",
  detail: "ルールの有効/無効",
  documentation:
    "true にするとルールが無効になります。ngDSL入力欄で一時的にルールを無効化したいときなどに便利です。",
};

const DEFAULT_RULE_PARAMETERS = [WORD_PARAMETER, SITES_PARAMETER, DISABLED_PARAMETER] as const;

export const NG_DSL_RULE_SPECS: readonly NGDslRuleSpec[] = [
  {
    // ルール識別子はNGTypesに集約し、DSLだけの独自文字列と乖離しないようにする。
    keyword: TYPE.REG_EXP,
    description: "全文を正規表現でNGにします。",
    wordDescription: "正規表現",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.REG_EXP_TITLE,
    description: "タイトルを正規表現でNGにします。",
    wordDescription: "正規表現",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.REG_EXP_HIGHLIGHT_TITLE,
    description: "タイトルを正規表現でハイライトします。",
    wordDescription: "正規表現",
    parameters: [
      WORD_PARAMETER,
      SITES_PARAMETER,
      BGCOLOR_PARAMETER,
      LABEL_PARAMETER,
      DISABLED_PARAMETER,
    ],
  },
  {
    keyword: TYPE.REG_EXP_NAME,
    description: "名前欄を正規表現でNGにします。",
    wordDescription: "正規表現",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.REG_EXP_MAIL,
    description: "メール欄を正規表現でNGにします。",
    wordDescription: "正規表現",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.REG_EXP_ID,
    aliases: ["RegExpID"],
    description: "ID を正規表現でNGにします。",
    wordDescription: "正規表現",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.REG_EXP_SLIP,
    description: "SLIP を正規表現でNGにします。",
    wordDescription: "正規表現",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.REG_EXP_BODY,
    description: "本文を正規表現でNGにします。",
    wordDescription: "正規表現",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.REG_EXP_URL,
    description: "URL を正規表現でNGにします。",
    wordDescription: "正規表現",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.TITLE,
    description: "タイトルを部分一致でNGにします。",
    wordDescription: "キーワード",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.HIGHLIGHT_TITLE,
    description: "タイトルを部分一致でハイライトします。",
    wordDescription: "キーワード",
    parameters: [
      WORD_PARAMETER,
      SITES_PARAMETER,
      BGCOLOR_PARAMETER,
      LABEL_PARAMETER,
      DISABLED_PARAMETER,
    ],
  },
  {
    keyword: TYPE.NAME,
    description: "名前欄を部分一致でNGにします。",
    wordDescription: "キーワード",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.MAIL,
    description: "メール欄を部分一致でNGにします。",
    wordDescription: "キーワード",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.ID,
    aliases: ["Id", "id"],
    description: "ID を部分一致でNGにします。",
    wordDescription: "ID",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.SLIP,
    description: "SLIP を部分一致でNGにします。",
    wordDescription: "SLIP",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.BODY,
    description: "本文を部分一致でNGにします。",
    wordDescription: "キーワード",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.URL,
    description: "URL を部分一致でNGにします。",
    wordDescription: "URL",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
  {
    keyword: TYPE.RES_COUNT,
    description: "レス数でスレッドをNGにします。",
    wordDescription: "レス数",
    parameters: DEFAULT_RULE_PARAMETERS,
  },
] as const;

const NG_DSL_RULE_SPEC_MAP = new Map<string, NGDslRuleSpec>();

for (const spec of NG_DSL_RULE_SPECS) {
  NG_DSL_RULE_SPEC_MAP.set(spec.keyword.toLowerCase(), spec);
  for (const alias of spec.aliases ?? []) {
    NG_DSL_RULE_SPEC_MAP.set(alias.toLowerCase(), spec);
  }
}

const NG_DSL_PARAMETER_ALIASES = new Map<string, NGDslParameterName>([
  ["word", "word"],
  ["sites", "sites"],
  ["scope", "sites"],
  ["bgcolor", "bgColor"],
  ["bgColor", "bgColor"],
  ["label", "label"],
  ["disabled", "disabled"],
]);

export function getNgDslRuleSpec(keyword: string): NGDslRuleSpec | null {
  return NG_DSL_RULE_SPEC_MAP.get(keyword.trim().toLowerCase()) ?? null;
}

export function normalizeNgDslKeyword(keyword: string): string {
  return getNgDslRuleSpec(keyword)?.keyword ?? keyword.trim();
}

export function normalizeNgDslParameterName(parameterName: string): NGDslParameterName | null {
  const trimmed = parameterName.trim();
  return (
    NG_DSL_PARAMETER_ALIASES.get(trimmed) ??
    NG_DSL_PARAMETER_ALIASES.get(trimmed.toLowerCase()) ??
    null
  );
}

interface SplitNgDslOptions {
  preserveEmpty?: boolean;
}

interface SplitNgDslState {
  quote: "'" | '"' | null;
  escapeNext: boolean;
  parenDepth: number;
  bracketDepth: number;
  braceDepth: number;
}

function createSplitState(): SplitNgDslState {
  return {
    quote: null,
    escapeNext: false,
    parenDepth: 0,
    bracketDepth: 0,
    braceDepth: 0,
  };
}

function advanceSplitState(state: SplitNgDslState, char: string): void {
  if (state.escapeNext) {
    state.escapeNext = false;
    return;
  }

  if (state.quote) {
    if (char === "\\") {
      state.escapeNext = true;
      return;
    }
    if (char === state.quote) {
      state.quote = null;
    }
    return;
  }

  if (char === '"' || char === "'") {
    state.quote = char;
    return;
  }

  switch (char) {
    case "(":
      state.parenDepth += 1;
      break;
    case ")":
      state.parenDepth = Math.max(0, state.parenDepth - 1);
      break;
    case "[":
      state.bracketDepth += 1;
      break;
    case "]":
      state.bracketDepth = Math.max(0, state.bracketDepth - 1);
      break;
    case "{":
      state.braceDepth += 1;
      break;
    case "}":
      state.braceDepth = Math.max(0, state.braceDepth - 1);
      break;
  }
}

function isTopLevelState(state: SplitNgDslState): boolean {
  return (
    state.quote == null &&
    state.parenDepth === 0 &&
    state.bracketDepth === 0 &&
    state.braceDepth === 0
  );
}

export function splitNgDslTopLevel(
  source: string,
  separator: string | readonly string[],
  options: SplitNgDslOptions = {},
): string[] {
  const state = createSplitState();
  const segments: string[] = [];
  let current = "";

  const isSeparator =
    typeof separator === "string"
      ? (c: string) => c === separator
      : (c: string) => separator.includes(c);

  const pushCurrent = () => {
    const segment = current.trim();
    if (segment !== "" || options.preserveEmpty) {
      segments.push(segment);
    }
    current = "";
  };

  for (const char of source) {
    if (isSeparator(char) && isTopLevelState(state)) {
      pushCurrent();
      continue;
    }

    current += char;
    advanceSplitState(state, char);
  }

  pushCurrent();
  return segments;
}

export function splitNgDslEntries(source: string): string[] {
  return splitNgDslTopLevel(source, ["\n", "\r"]);
}

function stripOptionalQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];
  if ((firstChar === '"' && lastChar === '"') || (firstChar === "'" && lastChar === "'")) {
    // ngDSL入力欄では正規表現をJS文字列風に貼り付けるケースが多いため、
    // 引用符付き値に限って `\\` を1層だけ解釈し、`\` と同等に扱う。
    return trimmed.slice(1, -1).replace(/\\\\/g, "\\");
  }

  return trimmed;
}

function findTopLevelAssignmentIndex(source: string): number {
  const state = createSplitState();

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "=" && isTopLevelState(state)) {
      return index;
    }
    advanceSplitState(state, char);
  }

  return -1;
}

export function parseNgDslScopeValue(value: string): string[] | undefined {
  const trimmed = stripOptionalQuotes(value);
  if (trimmed === "" || trimmed === "*") {
    return undefined;
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1);
    const scopes = splitNgDslTopLevel(inner, [",", "\n", "\r", " ", "\t"])
      .map(stripOptionalQuotes)
      .filter((scope) => scope !== "" && scope !== "*");
    return scopes.length > 0 ? scopes : undefined;
  }

  return [trimmed];
}

export interface ParsedNgDslArguments {
  word?: string;
  scope?: string[];
  params?: Record<string, string>;
}

interface ParseNgDslArgumentsOptions {
  positionalWord?: boolean;
}

export function parseNgDslArguments(
  argsSource: string,
  options: ParseNgDslArgumentsOptions = {},
): ParsedNgDslArguments {
  const args = splitNgDslTopLevel(argsSource, [",", "\n", "\r", " ", "\t"]);
  const params: Record<string, string> = {};
  let word: string | undefined;
  let scope: string[] | undefined;

  for (const arg of args) {
    if (arg === "") {
      continue;
    }

    const assignmentIndex = findTopLevelAssignmentIndex(arg);
    if (assignmentIndex < 0) {
      // 新DSLでは先頭の裸引数を word と見なせるようにして、
      // `word=` の明示と短い入力の両方を両立させる。
      if (options.positionalWord && word == null) {
        word = stripOptionalQuotes(arg);
        continue;
      }

      if (scope == null) {
        scope = parseNgDslScopeValue(arg);
      }
      continue;
    }

    const rawKey = arg.slice(0, assignmentIndex).trim();
    const value = stripOptionalQuotes(arg.slice(assignmentIndex + 1));
    if (rawKey === "" || value === "") {
      continue;
    }

    const key = normalizeNgDslParameterName(rawKey);
    if (key === "word") {
      word = value;
      continue;
    }

    if (key === "sites") {
      scope = parseNgDslScopeValue(value);
      continue;
    }

    if (key != null) {
      params[key] = value;
      continue;
    }

    params[rawKey] = value;
  }

  return {
    ...(word != null ? { word } : {}),
    ...(scope != null ? { scope } : {}),
    ...(Object.keys(params).length > 0 ? { params } : {}),
  };
}

function findMatchingParenIndex(source: string, openParenIndex: number): number {
  const state = createSplitState();

  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index];
    advanceSplitState(state, char);
    if (char === ")" && state.parenDepth === 0) {
      return index;
    }
  }

  return -1;
}

export interface ExtractedNgDslFunctionCall {
  keyword: string;
  argsSource: string;
  valueSource?: string;
}

export function extractNgDslFunctionCall(source: string): ExtractedNgDslFunctionCall | null {
  const trimmed = source.trim();
  const openParenIndex = trimmed.indexOf("(");
  if (openParenIndex <= 0) {
    return null;
  }

  const closeParenIndex = findMatchingParenIndex(trimmed, openParenIndex);
  if (closeParenIndex < 0) {
    return null;
  }

  const suffix = trimmed.slice(closeParenIndex + 1).trim();
  if (suffix !== "") {
    const suffixMatch = suffix.match(/^:\s*([\s\S]*)$/);
    if (!suffixMatch) {
      return null;
    }
    return {
      keyword: normalizeNgDslKeyword(trimmed.slice(0, openParenIndex)),
      argsSource: trimmed.slice(openParenIndex + 1, closeParenIndex),
      valueSource: suffixMatch[1].trim(),
    };
  }

  return {
    keyword: normalizeNgDslKeyword(trimmed.slice(0, openParenIndex)),
    argsSource: trimmed.slice(openParenIndex + 1, closeParenIndex),
  };
}

const SIMPLE_BARE_VALUE = /^[^,\s()[\]{}=:"']+$/u;

export function stringifyNgDslValue(
  value: string,
  options: { alwaysQuote?: boolean } = {},
): string {
  if (!options.alwaysQuote && SIMPLE_BARE_VALUE.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

export function stringifyNgDslSitesValue(sites: readonly string[]): string {
  if (sites.length === 1) {
    return stringifyNgDslValue(sites[0]);
  }
  return `[${sites.map((site) => stringifyNgDslValue(site)).join(" ")}]`;
}
