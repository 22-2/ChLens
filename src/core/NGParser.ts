import { InternalNGElement, TYPE } from "src/core/NGTypes";
import { normalize, stringToDate } from "src/core/jsutil";
import {
  extractNgDslFunctionCall,
  normalizeNgDslKeyword,
  parseNgDslArguments,
  splitNgDslEntries,
} from "src/core/ngDsl";

const _ignoreResRegNumber = /^ignoreResNumber:(\d+)(?:-?(\d+))?,(.*)$/;
const _ignoreNgType = /^ignoreNgType:(?:\$\((.*?)\):)?(.*)$/;
const _expireDate = /^expireDate:(\d{4}\/\d{1,2}\/\d{1,2}),(.*)$/;
const _attachName = /^attachName:([^,]*),(.*)$/;
const _expNgWords = /^\$\[(.*?)\]\$:(.*)$/;

/**
 * NG DSL から \/* *\/ 形式のブロックコメントと // 形式の行コメントを除去する。
 * ネストは非対応で、最初の \/* と最初の *\/ でペアを作る。
 */
function removeNgDslComments(source: string): string {
  let result = source;
  // /* */ ブロックコメントを除去（ネスト非対応、最初にマッチしたもの）
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  // // 行コメントを除去
  result = result.replace(/^[ \t]*\/\/.*$/gm, "");
  return result;
}

const _getNgElement = function (ngWord: string): InternalNGElement | null {
  ngWord = ngWord.trim();
  // 設定画面のDSL例をそのまま貼り付けても動くように、`//` 行コメントを無視する。
  if (ngWord.startsWith("//") || ngWord === "") {
    return null;
  }
  const ngElement: InternalNGElement = {
    type: "",
    word: "",
    subElements: [],
  };

  if (_expNgWords.test(ngWord)) {
    const m = _expNgWords.exec(ngWord)!;
    for (let i = 1; i <= 2; i++) {
      const ele = _getNgElement(m[i]);
      if (!ele) {
        continue;
      }
      if (ngElement.type !== "") {
        const subElement: InternalNGElement = {
          type: ngElement.type,
          word: ngElement.word,
          scope: ngElement.scope,
          params: ngElement.params,
        };
        ngElement.subElements!.push(subElement);
      }
      ngElement.type = ele.type;
      ngElement.word = ele.word;
      ngElement.scope = ele.scope;
      ngElement.params = ele.params;
      if (ele.subElements && ele.subElements.length > 0) {
        ngElement.subElements!.push(...ele.subElements);
      }
    }
    return ngElement;
  }

  const functionCall = extractNgDslFunctionCall(ngWord);
  if (functionCall) {
    const { word, scope, params } = parseNgDslArguments(
      functionCall.argsSource,
      {
        positionalWord: functionCall.valueSource == null,
      },
    );

    const normalizedKeyword = normalizeNgDslKeyword(functionCall.keyword);
    ngElement.type = normalizedKeyword;
    const rawWord = word ?? functionCall.valueSource ?? "";
    // 変更理由: 正規表現型のwordをnormalizeすると、カタカナ→ひらがな・小文字化・空白除去・NFKCで
    // パターン自体が壊れてしまう(例: ラノベ→らのべ で生タイトルと不一致、\S→\s、スペース消失)。
    // 正規表現は文字通り扱い(照合側の生フィールドへtest)、.includes()系の非正規表現型のみ
    // 従来どおりnormalizeして正規化済みテキストと比較する。
    ngElement.word = ngElement.type.startsWith(TYPE.REG_EXP)
      ? rawWord
      : normalize(rawWord);

    if (scope != null && scope.length > 0) {
      ngElement.scope = {
        value: scope.length === 1 ? scope[0] : scope,
      };
    }
    if (params != null) {
      ngElement.params = params;
    }

    if (ngElement.type === TYPE.AUTO) {
      let tmp: RegExpMatchArray | null;
      if (ngElement.word === "") {
        ngElement.word = "*";
      } else if ((tmp = /\$\((.*)\):/.exec(ngElement.word))) {
        if (tmp[1] != null) {
          ngElement.subType = tmp[1].split(",");
        }
      }
    }

    return ngElement;
  }

  // 完全な新DSLへ移行するため、DSL書式でないものはすべてただのテキスト(BODY)NGとして扱う
  ngElement.type = TYPE.BODY;
  ngElement.word = normalize(ngWord);
  return ngElement;
};

export function parseNgString(string: string): Set<InternalNGElement> {
  const ng = new Set<InternalNGElement>();
  if (string === "") {
    return ng;
  }

  // NG DSL からコメント（// と /* */）を除去
  const cleaned = removeNgDslComments(string);
  const ngStrSplit = splitNgDslEntries(cleaned);
  for (let ngWord of ngStrSplit) {
    ngWord = ngWord.trim();
    if (ngWord.startsWith("//") || ngWord === "") {
      continue;
    }

    let ngElement: Partial<InternalNGElement> = {};
    let m: RegExpMatchArray | null;

    while (true) {
      if ((m = ngWord.match(_ignoreResRegNumber)) != null) {
        ngElement = {
          ...ngElement,
          start: m[1],
          finish: m[2],
        };
        ngWord = m[3].trim();
        continue;
      }

      if ((m = ngWord.match(_ignoreNgType)) != null) {
        ngElement = {
          ...ngElement,
          exception: true,
          subType: m[1] != null ? m[1].split(",") : undefined,
        };
        ngWord = m[2].trim();
        continue;
      }

      if ((m = ngWord.match(_expireDate)) != null) {
        const expire = stringToDate(`${m[1]} 23:59:59`);
        if (expire) {
          ngElement = {
            ...ngElement,
            expire: expire.valueOf() + 1000,
          };
        }
        ngWord = m[2].trim();
        continue;
      }

      if ((m = ngWord.match(_attachName)) != null) {
        ngElement = {
          ...ngElement,
          name: m[1],
        };
        ngWord = m[2].trim();
        continue;
      }

      break;
    }

    const ele = _getNgElement(ngWord);
    if (ele == null || ele?.params?.disabled) {
      continue;
    }
    ngElement.type = ele.type;
    ngElement.word = ele.word;
    if (ele.subType != null) {
      ngElement.subType = ele.subType;
    }
    if (ele.subElements != null) {
      ngElement.subElements = ele.subElements;
    }
    if (ele.scope != null) {
      ngElement.scope = ele.scope;
    }
    if (ele.params != null) {
      ngElement.params = ele.params;
    }

    if (ngElement.exception == null) {
      ngElement.exception = false;
    }
    if (ngElement.subType != null) {
      for (let i = ngElement.subType.length - 1; i >= 0; i--) {
        const st = ngElement.subType[i];
        ngElement.subType[i] = st.trim();
        if (ngElement.subType[i] === "") {
          ngElement.subType.splice(i, 1);
        }
      }
      if (ngElement.subType.length === 0) {
        ngElement.subType = undefined;
      }
    }

    if (ngElement.word !== "") {
      ng.add(ngElement as InternalNGElement);
    }
  }
  return ng;
}

export function setupNgRegex(
  obj: Iterable<InternalNGElement>,
  notifyError: (type: string, word: string) => void,
): void {
  const _convReg = function ({
    type,
    word,
  }: InternalNGElement): RegExp | undefined {
    let reg: RegExp | undefined;
    try {
      reg = new RegExp(word, "i");
    } catch (error) {
      notifyError(type, word);
    }
    return reg;
  };

  for (const n of obj) {
    let convFlag = true;
    if (n.subElements != null) {
      for (const subElement of n.subElements) {
        if (!subElement.type.startsWith(TYPE.REG_EXP)) {
          continue;
        }
        subElement.reg = _convReg(subElement);
        if (!subElement.reg) {
          subElement.type = TYPE.INVALID;
          convFlag = false;
          break;
        }
      }
    }
    if (convFlag && n.type.startsWith(TYPE.REG_EXP)) {
      n.reg = _convReg(n);
      if (!n.reg) {
        convFlag = false;
      }
    }
    if (!convFlag) {
      n.type = TYPE.INVALID;
    }
  }
}
