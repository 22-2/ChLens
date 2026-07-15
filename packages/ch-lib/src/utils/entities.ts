const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decodes HTML entities including numeric character references.
 * Does not depend on DOM.
 */
export function decodeCharReference(str: string): string {
  return str.replace(/&(?:#(\d+)|#x([\dA-Fa-f]+)|([a-zA-Z]+));/g, (match, dec, hex, name) => {
    if (dec) {
      return String.fromCodePoint(parseInt(dec, 10));
    }
    if (hex) {
      return String.fromCodePoint(parseInt(hex, 16));
    }
    if (name) {
      return ENTITIES[name] || match;
    }
    return match;
  });
}
