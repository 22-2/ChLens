import Editor, { loader, useMonaco } from "@monaco-editor/react";
import JSON5 from "json5";
import React, { useEffect, useMemo } from "react";
import { convertDSLToUser } from "src/core/NGConverter";
import ngSchema from "src/core/ng-schema.json";

const browser = (window as any).browser || (window as any).chrome;

type MonacoEnvironmentLike = {
  getWorker?: (moduleId: string, label: string) => Worker;
  getWorkerUrl?: (moduleId: string, label: string) => string;
  [key: string]: unknown;
};

// MonacoEnvironment を loader より先にセットする（loaderの非同期初期化前に確実に差し込む）
// getWorker で直接 Worker インスタンスを返し blob URL ラッパーを回避する
const workerMap: Record<string, string> = {
  json: "json.worker-DKiEKt88.js",
  css: "css.worker-HnVq6Ewq.js",
  scss: "css.worker-HnVq6Ewq.js",
  less: "css.worker-HnVq6Ewq.js",
  html: "html.worker-B51mlPHg.js",
  handlebars: "html.worker-B51mlPHg.js",
  razor: "html.worker-B51mlPHg.js",
  typescript: "ts.worker-CMbG-7ft.js",
  javascript: "ts.worker-CMbG-7ft.js",
};

const resolveWorkerUrl = (label: string): string => {
  const file = workerMap[label] ?? "editor.worker-Be8ye1pW.js";
  return browser.runtime.getURL(`lib/monaco/vs/assets/${file}`);
};

const configureMonacoEnvironment = (): void => {
  const globalScope = globalThis as typeof globalThis & {
    MonacoEnvironment?: MonacoEnvironmentLike;
  };

  // monaco側が初期化時にMonacoEnvironmentを書き換えるため、必要なキーを維持しつつworker解決だけ固定化する
  const previous = globalScope.MonacoEnvironment ?? {};
  globalScope.MonacoEnvironment = {
    ...previous,
    getWorker: (_moduleId: string, label: string) => {
      return new Worker(resolveWorkerUrl(label), {
        type: "module",
        name: `monaco-${label || "editor"}`,
      });
    },
    getWorkerUrl: (_moduleId: string, label: string) => {
      return resolveWorkerUrl(label);
    },
  };
};

configureMonacoEnvironment();

// browser.runtime.getURL で完全なURLを取得する（/から始まる相対パスは拡張では機能しない）
loader.config({
  paths: { vs: browser.runtime.getURL("lib/monaco/vs") },
});

interface NGEditorProps {
  value: string; // DSL or JSON5 string
  onChange: (value: string) => void;
}

export const NGEditor: React.FC<NGEditorProps> = ({ value, onChange }) => {
  const monaco = useMonaco();

  // DSLを検出したらJSON5に変換して表示する
  const initialValue = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed.startsWith("[") || trimmed.startsWith("{")) {
      return value;
    }
    try {
      // 既存のDSLを検知したので、JSON5に変換する
      const rules = convertDSLToUser(value);
      return JSON5.stringify(rules, { space: 2, quote: '"' });
    } catch (e) {
      console.error("Failed to convert DSL to JSON5", e);
      return value;
    }
  }, [value]);

  useEffect(() => {
    // editor.main.js 側でMonacoEnvironmentが上書きされるケースがあるため、mount後にも再適用する
    configureMonacoEnvironment();
    if (monaco) {
      monaco.editor.setTheme("vs-dark");
      monaco.json.jsonDefaults.setDiagnosticsOptions({
        // validate: true はAJVがnew Function()でスキーマをコンパイルするためCSP違反になる
        validate: false,
        allowComments: true,
        schemas: [
          {
            uri: browser.runtime.getURL("ng-schema.json"),
            fileMatch: ["*"],
            schema: ngSchema,
          },
        ],
      });
    }
  }, [monaco]);

  const handleEditorChange = (newValue: string | undefined) => {
    if (newValue === undefined) return;
    onChange(newValue);
  };

  return (
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
        defaultLanguage="json"
        value={initialValue}
        onChange={handleEditorChange}
        beforeMount={() => {
          configureMonacoEnvironment();
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          formatOnPaste: true,
          formatOnType: true,
          automaticLayout: true,
          tabSize: 2,
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
};
