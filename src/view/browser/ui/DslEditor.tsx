import Editor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { Alert } from "src/view/browser/ui/Alert";

const logger = createLogger("DslEditor");

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
  const [monaco, setMonaco] = useState<typeof Monaco | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const theme = useTheme();
  const monacoTheme = theme === "dark" ? "vs-dark" : "vs";
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import("src/view/browser/ui/monacoDslRuntime")
      .then(({ initializeDslMonaco }) => initializeDslMonaco())
      .then((api) => {
        if (!cancelled) setMonaco(api);
      })
      .catch((error: unknown) => {
        logger.error("Monacoの初期化に失敗しました:", error);
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
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

  if (!monaco) {
    return (
      <div className="dsl-editor">
        <div className="dsl-editor__surface">
          {loadFailed ? (
            <Alert variant="danger" title="エディターを読み込めませんでした">
              設定画面を閉じて、もう一度開いてください。
            </Alert>
          ) : (
            <div role="status">エディターを読み込んでいます…</div>
          )}
        </div>
      </div>
    );
  }

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
            // DSLの段数は自分で決める。Enterは現在の深さだけ引き継ぎ、貼り付けを再インデントしない。
            autoIndent: "keep",
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            scrollBeyondLastLine: false,
            quickSuggestions: { other: true, comments: false, strings: true },
            suggestOnTriggerCharacters: true,
            // ホバーは行の下に開く。上に開くと、先頭付近の行で縮小画像（類似画像NG）が編集欄の上端で切れるため。
            // fixedOverflowWidgets で編集欄の外へ出す方法は、NGと置換の編集欄を切り替えたときに
            // 前の編集欄の補完一覧が残ってクリックを奪い、入力できなくなったので使わない。
            hover: { above: false },
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
