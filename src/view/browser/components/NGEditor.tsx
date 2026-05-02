import Editor, { loader, useMonaco } from "@monaco-editor/react";
import JSON5 from "json5";
import { Trash2 } from "lucide-react";
import React, { useEffect, useMemo } from "react";
import { platform } from "src/app/platform";
import {
  convertDSLToUser,
  stringifyToJSON5,
  tryParseJSON5Rules,
  type NGRule,
} from "src/core/NGConverter";
import ngSchema from "src/core/ng-schema.json";

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

const NG_JSON5_EXAMPLE = `[
  {
    word: "荒らし",
    target: "body",
  },
  {
    word: "重要",
    type: "highlight",
    target: "title",
    highlightParams: {
      bgColor: "red",
      label: "注目",
    },
  },
  {
    word: "abc123",
    target: "id",
  },
]`;

// 旧設定から移行するユーザー向けに、JSON5だけでなくDSL形式の最小例も明示する。
const NG_DSL_EXAMPLE = `Body: 荒らし
HighlightTitle(*, bgColor=#ffcdd2, label=注目): 重要
ID: abc123`;

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

  // DSLを検出したらJSON5に変換して表示する
  const initialValue = useMemo(() => {
    const trimmed = value.trim();
    // JSON5はコメント始まりでも有効なので、先頭文字ではなく実際にparseできるかで判定する。
    if (trimmed === "" || tryParseJSON5Rules(value) != null) {
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
      monaco.editor.setTheme("vs-dark");
      monaco.json.jsonDefaults.setDiagnosticsOptions({
        // validate: true はAJVがnew Function()でスキーマをコンパイルするためCSP違反になる
        validate: false,
        allowComments: true,
        schemas: [
          {
            uri: platform.window.getAssetUrl("ng-schema.json"),
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

    // 一括編集後の保存形式をJSON5へ統一して、次回編集時の解釈差分を避ける。
    onChange(stringifyToJSON5(filteredRules));
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
          <div className="ng-editor__help-label">JSON5</div>
          <pre className="ng-editor__help-code">{NG_JSON5_EXAMPLE}</pre>
        </div>
      </details>
    </div>
  );
};
