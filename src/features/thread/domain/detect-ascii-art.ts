const ASCII_ART_GLYPHS = /[┌┐└┘├┤┬┴┼│─━┃┏┓┗┛╋╭╮╰╯／＼∩∪∧∨☆★●○◎◆◇■□△▲▽▼]+/g;

function toPlainText(message: string): string {
  return message
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|p|pre|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/gi, "&");
}

/**
 * AAらしい行構成が複数行に現れる場合だけ検出する。
 * 単なる長文や、1行だけ空白・記号が多いレスはAA表示へ切り替えない。
 */
export function detectAsciiArt(message: string): boolean {
  if (/```|<pre\b/i.test(message)) {
    return false;
  }

  const lines = toPlainText(message)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length < 3) {
    return false;
  }

  const alignedLines = lines.filter((line) => /　{2,}| {4,}|　 |　[^\s]/.test(line)).length;
  if (alignedLines >= 2) {
    return true;
  }

  const drawnCharacterCount = lines.reduce(
    (total, line) => total + (line.match(ASCII_ART_GLYPHS)?.join("").length ?? 0),
    0,
  );
  const visibleCharacterCount = lines.join("").replace(/\s/g, "").length;
  return visibleCharacterCount >= 12 && drawnCharacterCount / visibleCharacterCount >= 0.35;
}
