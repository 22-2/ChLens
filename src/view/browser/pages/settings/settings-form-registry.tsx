import type {
  FieldTemplateProps,
  ObjectFieldTemplateProps,
  RJSFSchema,
  UiSchema,
  ValidatorType,
} from "@rjsf/utils";
import { Info } from "lucide-react";
import React from "react";
import { NGEditor, type NGEditorProps } from "src/view/browser/components/NGEditor";
import type {
  SettingsFieldDefinition,
  SettingsSectionFormData,
} from "src/view/browser/pages/settings/settings-types";

// 拡張機能ページのCSPではAJVの実行時コンパイル(new Function)が失敗するため、
// 設定画面は保存を優先した最小バリデータで動かし、コンソールエラーを防ぐ。
export const settingsValidator: ValidatorType<SettingsSectionFormData, RJSFSchema> = {
  validateFormData: () => ({ errors: [], errorSchema: {} }),
  isValid: () => true,
  rawValidation: () => ({ errors: [] }),
};

export function buildFieldSchema(field: SettingsFieldDefinition): RJSFSchema {
  const schema: RJSFSchema = {
    title: field.title,
  };

  if (field.description) {
    schema.description = field.description;
  }

  switch (field.kind) {
    case "boolean":
      schema.type = "boolean";
      break;
    case "number":
      schema.type = "number";
      if (field.minimum !== undefined) {
        schema.minimum = field.minimum;
      }
      if (field.maximum !== undefined) {
        schema.maximum = field.maximum;
      }
      break;
    case "string":
      schema.type = "string";
      if (field.options) {
        schema.oneOf = field.options.map((option) => ({
          const: option.const,
          title: option.title,
        }));
      }
      break;
  }

  return schema;
}

export function buildUiSchema(
  fields: readonly SettingsFieldDefinition[],
): UiSchema<SettingsSectionFormData> {
  const uiSchema: UiSchema<SettingsSectionFormData> = {
    "ui:submitButtonOptions": {
      norender: true,
    },
  };

  for (const field of fields) {
    const fieldUi: Record<string, unknown> = {};
    const options: Record<string, unknown> = {};

    if (field.widget) {
      fieldUi["ui:widget"] = field.widget;
    }
    if (field.kind === "number" && field.step !== undefined) {
      options.step = field.step;
    }
    if (field.widget === "textarea") {
      options.rows = field.rows ?? 6;
    }
    if (Object.keys(options).length > 0) {
      fieldUi["ui:options"] = options;
    }

    uiSchema[field.key] = fieldUi;
  }

  return uiSchema;
}

function SettingsObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { properties, title, description } = props;

  return (
    <div className="settings-form-object">
      {title && <h2 className="settings-form-object-title">{title}</h2>}
      {description && <p className="settings-form-object-description">{description}</p>}
      <div className="settings-form-properties">
        {properties.map((element) => {
          return (
            <div key={element.name} className="settings-form-property">
              {element.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsFieldTemplate(props: FieldTemplateProps) {
  const {
    id,
    label,
    children,
    errors,
    help,
    description,
    hidden,
    required,
    schema,
    uiSchema,
    displayLabel,
  } = props;

  if (hidden) {
    return <div style={{ display: "none" }}>{children}</div>;
  }

  const hasDescription = !!(uiSchema?.["ui:description"] || schema?.description);
  const shouldRenderLabel = displayLabel && !!label;

  return (
    <div className={`settings-form-field settings-form-field--${id}`}>
      {shouldRenderLabel && (
        <label htmlFor={id} className="settings-form-field-label">
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}
      {hasDescription && description && (
        <div className="settings-form-field-description">
          <Info size={14} />
          {description}
        </div>
      )}
      <div className="settings-form-field-content">{children}</div>
      {errors}
      {help}
    </div>
  );
}

interface NGEditorWidgetProps {
  value?: NGEditorProps["value"];
  onChange: NonNullable<NGEditorProps["onChange"]>;
}

export const settingsFormWidgets = {
  ng_editor: ({ value, onChange }: NGEditorWidgetProps) => (
    <NGEditor value={value ?? ""} onChange={onChange} />
  ),
};

// 変更理由: テンプレートは Form 側へ一括登録し、
// 各 field の uiSchema を「見た目」ではなく「項目固有オプション」だけに保つ。
export const settingsFormTemplates = {
  FieldTemplate: SettingsFieldTemplate,
  ObjectFieldTemplate: SettingsObjectFieldTemplate,
};
