import Editor, { loader, useMonaco } from "@monaco-editor/react";
import JSON5 from "json5";
import React, { useEffect, useMemo } from "react";
import { convertDSLToUser } from "src/core/NGConverter";
import ngSchema from "src/core/ng-schema.json";

// Set local monaco path to avoid CSP errors in browser extensions
loader.config({ paths: { vs: "/lib/monaco/vs" } });

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
    if (monaco) {
      // @ts-ignore - Monaco's types might flag this as deprecated or mismatch in some environments
      const jsonLang = monaco.languages.json;
      if (jsonLang && jsonLang.jsonDefaults) {
        jsonLang.jsonDefaults.setDiagnosticsOptions({
          validate: true,
          allowComments: true,
          schemas: [
            {
              uri: "https://read.crx/ng-schema.json",
              fileMatch: ["*"],
              schema: ngSchema,
            },
          ],
        });
      }
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
