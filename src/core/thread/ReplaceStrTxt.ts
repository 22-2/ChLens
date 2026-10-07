import {
  ReplaceStrParser,
  type ReplaceStrRule,
  type ReplaceStrTarget,
} from "packages/chlib/src/index";
import { container } from "src/service-container/index";

let _replaceTable: ReplaceStrRule[] | null = null;
const _CONFIG_NAME = "replace_str_txt_obj";
const _CONFIG_STRING_NAME = "replace_str_txt";

const _config = {
  get(): unknown {
    // 設定未保存時 (null) は JSON.parse に空オブジェクト文字列を与えるのと同じ挙動にする。
    return JSON.parse(container.config.get(_CONFIG_NAME) ?? "null") as unknown;
  },
  set(value: unknown): void {
    void container.config.set(_CONFIG_NAME, JSON.stringify(value));
  },
  getString(): string | null {
    return container.config.get(_CONFIG_STRING_NAME);
  },
  setString(value: string): void {
    void container.config.set(_CONFIG_STRING_NAME, value);
  },
};

export function get(): ReplaceStrRule[] {
  if (_replaceTable == null) {
    // 設定未保存時は空文字としてパースし、従来どおり「ルールなし」にする。
    _replaceTable = ReplaceStrParser.parse(_config.getString() ?? "");
  }
  return _replaceTable;
}

export function set(value: string): void {
  _replaceTable = ReplaceStrParser.parse(value);
  _config.set(
    _replaceTable.map((rule) => {
      // beforeReg は実行時に生成する正規表現なので、設定へは保存しない。
      const serializedRule = { ...rule };
      delete serializedRule.beforeReg;
      return serializedRule;
    }),
  );
  _config.setString(value);
}

export function replace(url: string, title: string, response: ReplaceStrTarget): ReplaceStrTarget {
  return ReplaceStrParser.replace(url, title, response, get());
}
