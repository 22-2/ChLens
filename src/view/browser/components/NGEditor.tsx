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

export const NG_DSL_EXAMPLE = `// 基本の部分一致NG
Body(word="荒らし")

// word= は省略可能（Body(荒らし)も同じ意味）
Body("荒らし")

// 引用符「"」も省略可能（ただしスペースを含む場合は必要）
Body(荒らし)

// タイトルを部分一致でハイライト
HighlightTitle(重要 bgColor=#ffcdd2 label=注目)

// 特定IDをNG
ID(abc123)

// URLを正規表現でNG
RegExpUrl("https?://(?:x|twitter)\\\\.com/.+")

// 10回以上の画像連投を正規表現でNG
RegExpBody("(imgur\.com\/.+?){10}")`;

export const NG_DSL_MULTILINE_EXAMPLE = `// 複数サイト向けの正規表現ハイライト
RegExpHighlightTitle(
  "(imgur\\\\.com\\\\/.+?){15}"
  sites=[
    eddibb.cc
    5ch.io
  ]
  bgColor=red
  label=連投疑い
)`;

// // 複雑なand条件: 名前の正規表現 + 本文の正規表現 + 期限 + ラベル
// ANDやら期限などあるが、これは複雑なので隠しておいて、基本的には上のシンプルな例だけ見せるのが良さそう
interface NGDslHelpSnippetProps {
  code: string;
  minHeight?: number;
}

export const NGDslHelpSnippet: React.FC<NGDslHelpSnippetProps> = ({
  code,
  minHeight = 120,
}) => {
  const monaco = useMonaco();

  useEffect(() => {
    configureMonacoEnvironment();
    if (monaco) {
      ensureNgDslLanguage(monaco);
      monaco.editor.setTheme("vs-dark");
    }
  }, [monaco]);

  const snippetHeight = useMemo(() => {
    const lineCount = code.split("\n").length;
    const estimated = lineCount * 20 + 20;
    return `${Math.max(minHeight, Math.min(360, estimated))}px`;
  }, [code, minHeight]);

  return (
    <div className="ng-editor__help-code-editor" style={{ height: snippetHeight }}>
      <Editor
        height="100%"
        defaultLanguage={NG_DSL_LANGUAGE_ID}
        value={code}
        beforeMount={(beforeMountMonaco) => {
          configureMonacoEnvironment();
          ensureNgDslLanguage(beforeMountMonaco);
          try {
            beforeMountMonaco.editor.setTheme("vs-dark");
          } catch (e) {
            console.warn("Failed to set monaco theme in help snippet", e);
          }
        }}
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          lineNumbers: "on",
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 10,
          lineNumbersMinChars: 2,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          renderLineHighlight: "none",
          fontSize: 12,
        }}
      />
    </div>
  );
};

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
