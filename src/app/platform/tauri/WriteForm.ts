import iconv from "iconv-lite";
import type { WriteFormData, WriteFormField } from "src/app/platform/types";

const FORM_CHARSET_ALIASES: Record<string, string> = {
  "UTF-8": "utf8",
  SHIFT_JIS: "shift_jis",
  "EUC-JP": "euc-jp",
};

function encodeFormComponent(value: string, charset: string): string {
  const encoding = FORM_CHARSET_ALIASES[charset.toUpperCase()] ?? charset;
  const bytes = iconv.encode(value, encoding);
  let encoded = "";

  for (const byte of bytes) {
    if (
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      byte === 0x2a ||
      byte === 0x2d ||
      byte === 0x2e ||
      byte === 0x5f
    ) {
      encoded += String.fromCharCode(byte);
    } else if (byte === 0x20) {
      encoded += "+";
    } else {
      encoded += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }

  return encoded;
}

function normalizeFormLineBreaks(value: string): string {
  // 変更理由: HTMLフォーム送信はtextareaの改行をCRLFへ正規化するため、
  // Tauriの直接POSTでもブラウザ版と同じ本文バイト列を作る。
  return value.replace(/\r\n|\r|\n/g, "\r\n");
}

export function getWriteFormFields(formData: WriteFormData): WriteFormField[] {
  return [
    ...Object.entries(formData.input).map(([name, value]) => ({
      name,
      value,
      type: "input" as const,
    })),
    ...Object.entries(formData.textarea).map(([name, value]) => ({
      name,
      value: normalizeFormLineBreaks(value),
      type: "textarea" as const,
    })),
  ];
}

export function encodeWriteFields(fields: readonly WriteFormField[], charset: string): ArrayBuffer {
  // 変更理由: 確認ページは同名のhidden値やsubmit値を複数持つことがあるため、
  // Recordへ戻さず、HTMLフォームの順序と重複を保ったまま再送信する。
  const normalizedFields = fields.map((field) => ({
    ...field,
    value: field.type === "textarea" ? normalizeFormLineBreaks(field.value) : field.value,
  }));

  // 変更理由: Tauriでは拡張機能のフォーム送信を使えないため、
  // 日本語掲示板が期待するフォームの文字コードで百分率エンコードしてPOSTする。
  const encoded = normalizedFields
    .map(
      ({ name, value }) =>
        `${encodeFormComponent(name, charset)}=${encodeFormComponent(value, charset)}`,
    )
    .join("&");

  return new TextEncoder().encode(encoded).buffer;
}

export function encodeWriteForm(formData: WriteFormData): ArrayBuffer {
  return encodeWriteFields(getWriteFormFields(formData), formData.charset);
}
