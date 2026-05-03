import Editor, { loader, useMonaco } from "@monaco-editor/react";
import { Trash2 } from "lucide-react";
import React, { useEffect, useMemo } from "react";
import { platform } from "src/app/platform";
import {
  convertDSLToUser,
  convertUserToDSL,
  tryParseJSON5Rules,
  type NGRule,
} from "src/core/NGConverter";
import { NG_DSL_LANGUAGE_ID } from "src/core/ngDsl";
import { ensureNgDslLanguage } from "src/view/browser/components/ngDslMonaco";

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
  return platform.window.getAssetUrl(`lib/monaco/vs/assets/${file}`);
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

// platform経由でURL解決を統一し、コンポーネント側のブラウザAPI直参照を避ける。
loader.config({
  paths: { vs: platform.window.getAssetUrl("lib/monaco/vs") },
});

interface NGEditorProps {
  value: string; // DSL or JSON5 string
  onChange: (value: string) => void;
}

const NG_DSL_EXAMPLE = `Body(word="荒らし")
HighlightTitle(word="重要" bgColor=#ffcdd2 label="注目")
ID(word="abc123")`;

const NG_DSL_MULTILINE_EXAMPLE = `RegExpHighlightTitle(
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

  const json5Rules = tryParseJSON5Rules(source);
  if (json5Rules != null) {
    return json5Rules;
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

  // 保存済み設定がJSON5でも、編集面はDSLへ寄せて一覧性と補完を両立させる。
  const initialValue = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed === "") {
      return value;
    }

    const json5Rules = tryParseJSON5Rules(value);
    if (json5Rules != null) {
      return convertUserToDSL(json5Rules);
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
                // eslint-disable-next-line no-console
                console.warn("Failed to set monaco theme in beforeMount", e);
              }
            }}
            onMount={(editor, mountedMonaco) => {
              // エディタがマウントされるタイミングでもテーマを再適用する
              try {
                mountedMonaco.editor.setTheme("vs-dark");
              } catch (e) {
                // eslint-disable-next-line no-console
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

      <div className="ng-editor__actions">
        <button
          type="button"
          className="ng-editor__icon-btn"
          onClick={handleRemoveNgId}
          disabled={idRuleCount == null || idRuleCount === 0}
          title={
            idRuleCount == null
              ? "NG設定を解析できないため実行できません"
              : idRuleCount === 0
                ? "削除対象のNG IDルールはありません"
                : `NG IDルールを${idRuleCount}件削除します`
          }
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>

      <details className="ng-editor__help">
        <summary className="ng-editor__help-summary">記法の例</summary>
        <div className="ng-editor__help-body">
          <div className="ng-editor__help-label">DSL</div>
          <pre className="ng-editor__help-code">{NG_DSL_EXAMPLE}</pre>
          <div className="ng-editor__help-label">複数行 DSL</div>
          <pre className="ng-editor__help-code">{NG_DSL_MULTILINE_EXAMPLE}</pre>
          <div className="ng-editor__help-label">補足</div>
          <p className="ng-editor__help-note">
            JSON5 を貼り付けても読み込めますが、編集画面では DSL として扱います。
          </p>
        </div>
      </details>
    </div>
  );
};
