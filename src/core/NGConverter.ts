import { TYPE, parse as parseDSL } from "src/core/NG";
import { InternalNGElement } from "src/core/NGTypes";
import { stringifyNgDslSitesValue, stringifyNgDslValue } from "src/core/ngDsl";

export interface NGRule {
  enabled?: boolean;
  word: string;
  useRegex?: boolean;
  type?: "ng" | "highlight" | "auto";
  target?: "all" | "title" | "name" | "mail" | "id" | "slip" | "body" | "url" | "res_count";
  scope?: string[];
  highlightParams?: {
    bgColor?: string;
    label?: string;
  };
  expireDate?: string;
  andConditions?: Omit<NGRule, "andConditions">[];
  ignoreResNumber?: string;
  name?: string;
}

/**
 * NGRule 形式を内部の NG オブジェクト形式に変換する
 */
export function convertUserToInternal(rules: NGRule[]): InternalNGElement[] {
  return rules.map((rule) => {
    const isReg = !!rule.useRegex;
    const type = rule.type || "ng";
    const target = rule.target || "all";

    // oxlint-disable-next-line no-useless-assignment
    let targetType = "";
    if (type === "highlight") {
      targetType = isReg ? TYPE.REG_EXP_HIGHLIGHT_TITLE : TYPE.HIGHLIGHT_TITLE;
    } else if (type === "auto") {
      targetType = TYPE.AUTO;
    } else {
      switch (target) {
        case "title":
          targetType = isReg ? TYPE.REG_EXP_TITLE : TYPE.TITLE;
          break;
        case "name":
          targetType = isReg ? TYPE.REG_EXP_NAME : TYPE.NAME;
          break;
        case "mail":
          targetType = isReg ? TYPE.REG_EXP_MAIL : TYPE.MAIL;
          break;
        case "id":
          targetType = isReg ? TYPE.REG_EXP_ID : TYPE.ID;
          break;
        case "slip":
          targetType = isReg ? TYPE.REG_EXP_SLIP : TYPE.SLIP;
          break;
        case "body":
          targetType = isReg ? TYPE.REG_EXP_BODY : TYPE.BODY;
          break;
        case "url":
          targetType = isReg ? TYPE.REG_EXP_URL : TYPE.URL;
          break;
        case "res_count":
          targetType = TYPE.RES_COUNT;
          break;
        default:
          targetType = isReg ? TYPE.REG_EXP : TYPE.WORD;
      }
    }

    const internal: InternalNGElement = {
      type: targetType,
      word: rule.word,
      exception: false,
    };

    if (rule.scope && rule.scope.length > 0) {
      internal.scope = {
        value: rule.scope.length === 1 ? rule.scope[0] : [...rule.scope],
      };
    }

    if (rule.highlightParams) {
      internal.params = { ...rule.highlightParams };
    }

    if (rule.expireDate) {
      internal.expire = new Date(`${rule.expireDate} 23:59:59`).getTime();
    }

    if (rule.name) {
      internal.name = rule.name;
    }

    if (rule.ignoreResNumber) {
      const m = rule.ignoreResNumber.match(/^(\d+)(?:-(\d+))?$/);
      if (m) {
        internal.start = m[1];
        if (m[2]) internal.finish = m[2];
      }
    }

    if (rule.andConditions && rule.andConditions.length > 0) {
      internal.subElements = convertUserToInternal(rule.andConditions);
    }

    return internal;
  });
}

/**
 * 内部のNGオブジェクト形式をユーザーフレンドリーな NGRule 形式に変換する
 */
export function convertInternalToUser(internalObjs: InternalNGElement[]): NGRule[] {
  return internalObjs.map((obj) => {
    const rawWord = String(obj.word || "");
    const rule: NGRule = {
      word: rawWord,
    };

    const typeStr = String(obj.type || "");
    if (typeStr.startsWith(TYPE.REG_EXP)) {
      rule.useRegex = true;
    }

    if (typeStr.includes("Highlight") || typeStr === TYPE.REG_EXP_HIGHLIGHT_TITLE) {
      rule.type = "highlight";
    } else if (typeStr.startsWith("Auto") || typeStr === TYPE.AUTO) {
      rule.type = "auto";
    } else {
      rule.type = "ng";
    }

    if (typeStr.includes("Title")) rule.target = "title";
    else if (typeStr.includes("Name")) rule.target = "name";
    else if (typeStr.includes("Mail")) rule.target = "mail";
    else if (typeStr.includes("ID")) rule.target = "id";
    else if (typeStr.includes("Slip")) rule.target = "slip";
    else if (typeStr.includes("Body")) rule.target = "body";
    else if (typeStr.includes("Url")) rule.target = "url";
    else if (typeStr === TYPE.RES_COUNT) rule.target = "res_count";
    else if (typeStr === TYPE.WORD || typeStr === TYPE.REG_EXP) rule.target = "all";

    if (rule.target === "id") {
      rule.word = rawWord.replace(/^(?:ID|発信元):\s*/u, "");
    }

    if (obj.scope?.value) {
      const scopeValue = Array.isArray(obj.scope.value) ? obj.scope.value : [obj.scope.value];
      if (scopeValue.length > 0) {
        rule.scope = [...scopeValue];
      }
    }

    if (obj.params) {
      rule.highlightParams = { ...obj.params };
    }

    if (obj.expire) {
      rule.expireDate = new Date(obj.expire).toISOString().split("T")[0];
    }

    if (obj.name) {
      rule.name = obj.name;
    }

    if (obj.start) {
      rule.ignoreResNumber = obj.finish ? `${obj.start}-${obj.finish}` : `${obj.start}`;
    }

    if (obj.subElements && obj.subElements.length > 0) {
      rule.andConditions = convertInternalToUser(obj.subElements);
    }

    return rule;
  });
}

/**
 * DSL文字列を NGRule[] 形式に変換する
 */
export function convertDSLToUser(dslStr: string): NGRule[] {
  const ngSet = parseDSL(dslStr);
  // parseDSLはJS実装由来で型が緩いため、配列化時にSetであることを明示して扱う。
  return convertInternalToUser(Array.from(ngSet as Set<InternalNGElement>));
}

/**
 * NGRule 形式を DSL 文字列形式に変換する（既存の NG.js との互換性のため）
 */
export function convertUserToDSL(rules: NGRule[]): string {
  return rules
    .map((rule) => {
      let line = "";

      if (rule.name) line += `attachName:${rule.name},`;
      if (rule.expireDate) line += `expireDate:${rule.expireDate.replace(/-/g, "/")},`;
      if (rule.ignoreResNumber) line += `ignoreResNumber:${rule.ignoreResNumber},`;

      // oxlint-disable-next-line no-useless-assignment
      let targetType = "";
      const isReg = rule.useRegex;
      const type = rule.type || "ng";
      const target = rule.target || "all";

      if (type === "highlight") {
        targetType = isReg ? TYPE.REG_EXP_HIGHLIGHT_TITLE : TYPE.HIGHLIGHT_TITLE;
      } else if (type === "auto") {
        targetType = TYPE.AUTO;
      } else {
        switch (target) {
          case "title":
            targetType = isReg ? TYPE.REG_EXP_TITLE : TYPE.TITLE;
            break;
          case "name":
            targetType = isReg ? TYPE.REG_EXP_NAME : TYPE.NAME;
            break;
          case "mail":
            targetType = isReg ? TYPE.REG_EXP_MAIL : TYPE.MAIL;
            break;
          case "id":
            targetType = isReg ? TYPE.REG_EXP_ID : TYPE.ID;
            break;
          case "slip":
            targetType = isReg ? TYPE.REG_EXP_SLIP : TYPE.SLIP;
            break;
          case "body":
            targetType = isReg ? TYPE.REG_EXP_BODY : TYPE.BODY;
            break;
          case "url":
            targetType = isReg ? TYPE.REG_EXP_URL : TYPE.URL;
            break;
          case "res_count":
            targetType = TYPE.RES_COUNT;
            break;
          default:
            targetType = isReg ? TYPE.REG_EXP : TYPE.WORD;
        }
      }

      const args: string[] = [];

      // 新DSLでは値を必ず named argument で持たせて、補完とシグネチャ表示を安定させる。
      args.push(`word=${stringifyNgDslValue(rule.word)}`);

      if (rule.scope && rule.scope.length > 0) {
        args.push(`sites=${stringifyNgDslSitesValue(rule.scope)}`);
      }

      if (rule.highlightParams) {
        args.push(
          ...Object.entries(rule.highlightParams).map(
            ([key, value]) => `${key}=${stringifyNgDslValue(value)}`,
          ),
        );
      }

      const mainPart = `${targetType}(${args.join(" ")})`;

      if (rule.andConditions && rule.andConditions.length > 0) {
        const sub = rule.andConditions[0];
        const subDSL = convertUserToDSL([sub]).trim();
        line += `$[${subDSL}]$:${mainPart}`;
      } else {
        line += mainPart;
      }

      return line;
    })
    .join("\n");
}
