import iconv from "iconv-lite";
import type { WriteFormData } from "src/app/platform/types";

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

export function encodeWriteForm(formData: WriteFormData): ArrayBuffer {
  const fields = [
    ...Object.entries(formData.input),
    ...Object.entries(formData.textarea).map(
      ([key, value]) => [key, normalizeFormLineBreaks(value)] as const,
    ),
  ];

  // 変更理由: Tauriでは拡張機能のフォーム送信を使えないため、
  // 日本語掲示板が期待するフォームの文字コードで百分率エンコードしてPOSTする。
  const encoded = fields
    .map(
      ([key, value]) =>
        `${encodeFormComponent(key, formData.charset)}=${encodeFormComponent(value, formData.charset)}`,
    )
    .join("&");

  return new TextEncoder().encode(encoded).buffer;
}
