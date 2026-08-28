export interface SearchMatchRange {
  start: number;
  end: number;
}

interface NormalizedText {
  value: string;
  starts: number[];
  ends: number[];
}

interface SearchableTextNode {
  node: Text;
  start: number;
  end: number;
}

const SEARCH_HIGHLIGHT_CLASS = "res__search-match";

function normalizeWithOffsets(text: string): NormalizedText {
  let value = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let originalIndex = 0;

  for (const character of text) {
    const start = originalIndex;
    originalIndex += character.length;
    const normalizedCharacter = character.toLowerCase();
    value += normalizedCharacter;
    for (let index = 0; index < normalizedCharacter.length; index++) {
      starts.push(start);
      ends.push(originalIndex);
    }
  }

  return { value, starts, ends };
}

export function findSearchMatchRanges(text: string, query: string): SearchMatchRange[] {
  const normalizedQuery = query.toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const normalizedText = normalizeWithOffsets(text);
  const ranges: SearchMatchRange[] = [];
  let searchStart = 0;

  while (searchStart < normalizedText.value.length) {
    const normalizedStart = normalizedText.value.indexOf(normalizedQuery, searchStart);
    if (normalizedStart < 0) {
      break;
    }

    const normalizedEnd = normalizedStart + normalizedQuery.length - 1;
    ranges.push({
      start: normalizedText.starts[normalizedStart],
      end: normalizedText.ends[normalizedEnd],
    });
    searchStart = normalizedEnd + 1;
  }

  return ranges;
}

function appendHighlightedText(
  document: Document,
  fragment: DocumentFragment,
  text: string,
  ranges: SearchMatchRange[],
): void {
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, range.start)));
    }

    const mark = document.createElement("mark");
    mark.className = SEARCH_HIGHLIGHT_CLASS;
    mark.textContent = text.slice(range.start, range.end);
    fragment.append(mark);
    cursor = range.end;
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }
}

function collectSearchableText(document: Document): {
  text: string;
  nodes: SearchableTextNode[];
} {
  let text = "";
  const nodes: SearchableTextNode[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ALL, {
    acceptNode: (node) => {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).matches("script, style, template, mark")
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let currentNode = walker.nextNode();
  while (currentNode) {
    if (currentNode.nodeType === Node.ELEMENT_NODE && (currentNode as Element).tagName === "BR") {
      // stripHtml treats line breaks as searchable newlines, so keep that behavior when
      // matching across formatted HTML nodes as well.
      text += "\n";
    } else if (currentNode instanceof Text && currentNode.data.length > 0) {
      const start = text.length;
      text += currentNode.data;
      nodes.push({ node: currentNode, start, end: text.length });
    }
    currentNode = walker.nextNode();
  }

  return { text, nodes };
}

export function highlightSearchMatches(html: string, query: string): string {
  // 検索語が空なら元のHTMLをそのまま返し、通常表示時のDOM正規化や再描画差分を発生させない。
  if (!html || !query || typeof DOMParser === "undefined") {
    return html;
  }

  // HTML文字列の単純置換はリンク属性やアンカーHTMLまで書き換えるため、
  // DOMのテキストノードだけをmarkで包み、既存の要素と操作対象を維持する。
  const document = new DOMParser().parseFromString(html, "text/html");
  const searchableText = collectSearchableText(document);
  const ranges = findSearchMatchRanges(searchableText.text, query);

  let highlighted = false;
  for (const { node, start, end } of searchableText.nodes) {
    const localRanges = ranges
      .filter((range) => range.start < end && range.end > start)
      .map((range) => ({
        start: Math.max(range.start, start) - start,
        end: Math.min(range.end, end) - start,
      }));
    if (localRanges.length === 0 || !node.parentNode) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    appendHighlightedText(document, fragment, node.data, localRanges);
    node.parentNode.replaceChild(fragment, node);
    highlighted = true;
  }

  return highlighted ? document.body.innerHTML : html;
}
