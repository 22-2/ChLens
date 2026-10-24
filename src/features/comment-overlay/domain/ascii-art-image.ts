const MAX_ASCII_ART_LENGTH = 10_000;
const MAX_ASCII_ART_LINES = 80;
const FONT_SIZE = 24;
const LINE_HEIGHT = 30;

function escapeXml(text: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };
  return text.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

/** 大きすぎる本文は画像化せず、呼び出し元でテキスト表示へフォールバックする。 */
export function createAsciiArtImageUrl(text: string): string | null {
  if (text.length > MAX_ASCII_ART_LENGTH) return null;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > MAX_ASCII_ART_LINES) return null;

  const width = Math.max(1, ...lines.map((line) => Array.from(line).length)) * FONT_SIZE * 1.1;
  const height = Math.max(1, lines.length) * LINE_HEIGHT;
  const content = lines
    .map(
      (line, index) =>
        `<text xml:space="preserve" x="0" y="${FONT_SIZE + index * LINE_HEIGHT}">${escapeXml(line)}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="#f4f7fb" stroke="#07101d" stroke-width="1.5" paint-order="stroke" font-family="MS PGothic, Mona, monospace" font-size="${FONT_SIZE}">${content}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
