/**
 * テキスト・画像のクリップボード操作をまとめる。
 * ブラウザAPIへの依存をこのモジュールへ閉じ込めることで、レス変換やフィルタ判定が
 * クリップボード実装を経由して実行環境へ依存しないようにする。
 */

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard APIが使えない環境向けフォールバック
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

export function formatMarkdownLink(title: string, url: string): string {
  // 変更理由: コピー先でMarkdownリンクとして解釈できるようにしつつ、
  // タイトルとURLに含まれる構文文字の意味を保つ。
  const escapedTitle = title.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
  const escapedUrl = url.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  return `[${escapedTitle}](${escapedUrl})`;
}

export function canCopyImageToClipboard(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.write === "function" &&
    typeof globalThis.ClipboardItem !== "undefined"
  );
}

export async function copyImageBlob(blob: Blob): Promise<void> {
  if (!canCopyImageToClipboard()) {
    throw new Error("Image clipboard API is not available");
  }

  // 画像コピーはテキストのような安全なフォールバックがないため、
  // 対応ブラウザだけで明示的に ClipboardItem を使う。
  await navigator.clipboard.write([
    new globalThis.ClipboardItem({
      [blob.type]: blob,
    }),
  ]);
}
