import Editor, { loader, useMonaco } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef } from "react";
import { platform } from "src/app/platform";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { Alert } from "src/view/browser/ui/Alert";

type MonacoEnvironmentLike = {
  getWorker?: (moduleId: string, label: string) => Worker;
  getWorkerUrl?: (moduleId: string, label: string) => string;
  [key: string]: unknown;
};

// NGと置換で同じローカル配信のMonacoワーカーを使う。
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
    vs: "/lib/monaco/vs", // 直接指定するのが一番確実っす
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

export interface DslDiagnostic {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

interface DslEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  languageId: string;
  registerLanguage: (monaco: typeof Monaco) => void;
  diagnostics?: readonly DslDiagnostic[];
}

const NO_DIAGNOSTICS: readonly DslDiagnostic[] = [];

/** NGと文字列置換で、エディタ・テーマ・エラー表示を同じ部品に揃える。 */
export function DslEditor({
  value,
  onChange,
  label,
  languageId,
  registerLanguage,
  diagnostics = NO_DIAGNOSTICS,
}: DslEditorProps) {
  const monaco = useMonaco();
  const theme = useTheme();
  const monacoTheme = theme === "dark" ? "vs-dark" : "vs";
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    configureMonacoEnvironment();
    if (monaco) {
      registerLanguage(monaco);
      monaco.editor.setTheme(monacoTheme);
    }
  }, [monaco, monacoTheme, registerLanguage]);

  const updateMarkers = useCallback(
    (api: typeof Monaco, model: Monaco.editor.ITextModel | null) => {
      if (!model) return;
      api.editor.setModelMarkers(
        model,
        "dsl-validation",
        diagnostics.map((diagnostic) => ({
          startLineNumber: diagnostic.line,
          startColumn: diagnostic.column,
          endLineNumber: diagnostic.line,
          endColumn: Math.max(diagnostic.column + 1, model.getLineMaxColumn(diagnostic.line)),
          message: diagnostic.message,
          severity: api.MarkerSeverity.Error,
        })),
      );
    },
    [diagnostics],
  );

  useEffect(() => {
    if (monaco) updateMarkers(monaco, editorRef.current?.getModel() ?? null);
  }, [monaco, updateMarkers]);

  return (
    <div className="dsl-editor">
      <div className="dsl-editor__surface">
        <Editor
          height="100%"
          language={languageId}
          value={value}
          onChange={(next) => {
            if (next !== undefined) onChange(next);
          }}
          beforeMount={(api) => {
            configureMonacoEnvironment();
            registerLanguage(api);
            api.editor.setTheme(monacoTheme);
          }}
          onMount={(editor, api) => {
            editorRef.current = editor;
            api.editor.setTheme(monacoTheme);
            updateMarkers(api, editor.getModel());
          }}
          options={{
            ariaLabel: label,
            minimap: { enabled: false },
            fontSize: 14,
            formatOnPaste: false,
            formatOnType: false,
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            scrollBeyondLastLine: false,
            quickSuggestions: { other: true, comments: false, strings: true },
            suggestOnTriggerCharacters: true,
          }}
        />
      </div>
      {diagnostics.length > 0 && (
        <Alert variant="danger" title={`${label}を保存できません`}>
          <ul>
            {diagnostics.map((diagnostic, index) => (
              <li key={index}>
                {diagnostic.line}行{diagnostic.column}列: {diagnostic.message}
              </li>
            ))}
          </ul>
          最後に保存できたルールを引き続き使います。
        </Alert>
      )}
    </div>
  );
}

export interface DslSnippetToken {
  type: "plain" | "comment" | "string" | "rule" | "param" | "color";
  text: string;
}

/** 記法例は同じトークン色・余白を使い、Monacoの追加インスタンスを作らない。 */
export function DslHelpSnippet({
  code,
  tokenize,
}: {
  code: string;
  tokenize: (line: string) => readonly DslSnippetToken[];
}) {
  return (
    <pre className="dsl-editor__snippet">
      {code.split("\n").map((line, index) => (
        <div key={index}>
          {tokenize(line).map((token, tokenIndex) => (
            <span key={tokenIndex} className={`dsl-editor__token--${token.type}`}>
              {token.text || " "}
            </span>
          ))}
        </div>
      ))}
    </pre>
  );
}
