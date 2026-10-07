// HTML名付き参照はブラウザのHTMLパーサーで解釈し、既存の表示結果を維持する。
const span = document.createElement("span");

export function decodeCharReference(str: string): string {
  return str.replace(
    /&(?:#(\d+)|#x([\dA-Fa-f]+)|([\da-zA-Z]+));/g,
    (match: string, decimal?: string, hex?: string) => {
      if (decimal != null) return String.fromCodePoint(Number(decimal));
      if (hex != null) return String.fromCodePoint(Number.parseInt(hex, 16));
      span.innerHTML = match;
      return span.textContent ?? match;
    },
  );
}
