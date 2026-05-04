import Editor, { loader, useMonaco } from "@monaco-editor/react";
import React, { useEffect, useMemo } from "react";
import { platform } from "src/app/platform";
import {
  convertDSLToUser,
  convertUserToDSL,
  type NGRule,
} from "src/core/NGConverter";
import { NG_DSL_LANGUAGE_ID } from "src/core/ngDsl";
import { ensureNgDslLanguage } from "src/view/browser/components/ngDslMonaco";

type MonacoEnvironmentLike = {
  getWorker?: (moduleId: string, label: string) => Worker;
  getWorkerUrl?: (moduleId: string, label: string) => string;
  [key: string]: unknown;
};

// NGEditor.tsx 内の定数を修正
const workerMap: Record<string, string> = {
  json: "json.worker.js",
  css: "css.worker.js",
  scss: "css.worker.js",
  less: "css.worker.js",
  html: "html.worker.js",
  handlebars: "html.worker.js",
  razor: "html.worker.js",
  typescript: "ts.worker.js",
  javascript: "ts.worker.js",
};

// パス解決を絶対パスにするっす
const resolveWorkerUrl = (label: string): string => {
  const file = workerMap[label] ?? "editor.worker.js";
  const rawUrl = platform.window.getAssetUrl(`lib/monaco/vs/assets/${file}`);
  // 先頭に / がなければ付与して絶対パスにするっす
  return rawUrl.startsWith("/") ? rawUrl : "/" + rawUrl;
};

// loader.config も絶対パスにするっす
loader.config({
  paths: {
    vs: "/lib/monaco/vs" // 直接指定するのが一番確実っす
  },
});

const configureMonacoEnvironment = (): void => {
  const globalScope = globalThis as typeof globalThis & {
    MonacoEnvironment?: MonacoEnvironmentLike;
  };

  globalScope.MonacoEnvironment = {
    ...globalScope.MonacoEnvironment,
    getWorker: (_moduleId: string, label: string) => {
      const url = resolveWorkerUrl(label);
      // 同期的に Worker を返すために Blob ラッパーを使用
      const blob = new Blob([`importScripts("${url}")`], {
        type: "application/javascript",
      });
      return new Worker(URL.createObjectURL(blob), {
        name: `monaco-${label || "editor"}`,
      });
    },
  };
};

configureMonacoEnvironment();

interface NGEditorProps {
  value: string; // DSL string
  onChange: (value: string) => void;
}

export const NG_DSL_EXAMPLE = `Body(word="荒らし")
HighlightTitle(word="重要" bgColor=#ffcdd2 label="注目")
ID(word="abc123")`;

export const NG_DSL_MULTILINE_EXAMPLE = `RegExpHighlightTitle(
  word="VTuber"
  sites=[
    eddibb.cc
    5ch.net
  ]
  bgColor=red
  label="注目"
)`;

function parseRulesForBulkEdit(source: string): NGRule[] | null {
  const trimmed = source.trim();
  if (trimmed === "") {
    return [];
  }

  try {
    return convertDSLToUser(source);
  } catch {
    return null;
  }
}

function removeIdTargetRules(rules: NGRule[]): {
  filteredRules: NGRule[];
  removedCount: number;
} {
  let removedCount = 0;
  const filteredRules = rules.filter((rule) => {
    if (rule.target === "id") {
      removedCount += 1;
      return false;
    }
    return true;
  });

  return { filteredRules, removedCount };
}

export const NGEditor: React.FC<NGEditorProps> = ({ value, onChange }) => {
  const monaco = useMonaco();

  const initialValue = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed === "") {
      return value;
    }

    try {
      convertDSLToUser(value);
      return value;
    } catch (e) {
      console.error("Failed to normalize NG rules as DSL", e);
      return value;
    }
  }, [value]);

  const idRuleCount = useMemo(() => {
    const rules = parseRulesForBulkEdit(value);
    if (rules == null) {
      return null;
    }
    return rules.filter((rule) => rule.target === "id").length;
  }, [value]);

  useEffect(() => {
    // editor.main.js 側でMonacoEnvironmentが上書きされるケースがあるため、mount後にも再適用する
    configureMonacoEnvironment();
    if (monaco) {
      ensureNgDslLanguage(monaco);
      monaco.editor.setTheme("vs-dark");
    }
  }, [monaco]);

  const handleEditorChange = (newValue: string | undefined) => {
    if (newValue === undefined) return;
    onChange(newValue);
  };

  const handleRemoveNgId = () => {
    const rules = parseRulesForBulkEdit(value);
    if (rules == null) {
      window.alert(
        "現在のNG設定を解析できないため、NG ID一括削除を実行できません。",
      );
      return;
    }

    const { filteredRules, removedCount } = removeIdTargetRules(rules);
    if (removedCount === 0) {
      window.alert("削除対象のNG IDルールはありませんでした。");
      return;
    }

    const confirmed = window.confirm(
      `NG IDルールを${removedCount}件削除します。よろしいですか？`,
    );
    if (!confirmed) {
      return;
    }

    // 一括編集の後も DSL 表示と補完を維持したいため、保存形式を DSL に寄せる。
    onChange(convertUserToDSL(filteredRules));
  };

  return (
    <div className="ng-editor">
      <div
        style={{
          height: "500px",
          border: "1px solid var(--border-color, #ccc)",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        <Editor
          height="100%"
          defaultLanguage={NG_DSL_LANGUAGE_ID}
          value={initialValue}
          onChange={handleEditorChange}
          beforeMount={(beforeMountMonaco) => {
            configureMonacoEnvironment();
            ensureNgDslLanguage(beforeMountMonaco);
            // Editor インスタンス作成前にテーマを固定しておく（再生成時のフラッシュ対策）
            try {
              beforeMountMonaco.editor.setTheme("vs-dark");
            } catch (e) {
              // 万が一 monaco.editor が使えない環境でも安全に処理を続行する
              // ここは副作用であり、失敗しても動作に致命的な影響は与えない

              console.warn("Failed to set monaco theme in beforeMount", e);
            }
          }}
          onMount={(editor, mountedMonaco) => {
            // エディタがマウントされるタイミングでもテーマを再適用する
            try {
              mountedMonaco.editor.setTheme("vs-dark");
            } catch (e) {
              console.warn("Failed to set monaco theme on mount", e);
            }
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            formatOnPaste: false,
            formatOnType: false,
            automaticLayout: true,
            tabSize: 2,
            scrollBeyondLastLine: false,
            quickSuggestions: {
              other: true,
              comments: false,
              strings: true,
            },
            suggestOnTriggerCharacters: true,
          }}
        />
      </div>
    </div>
  );
};
