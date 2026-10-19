import {
  normalizeSearchText,
  normalizeSearchUnit,
  splitSearchUnits,
} from "src/view/browser/utils/search-normalize";

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

export interface HighlightOptions {
  /** 一致箇所を包む mark のクラス。検索フィルタとページ内検索で描き分ける。 */
  className?: string;
  /** 何番目（0始まり）の一致を「現在の一致」として強調するか。 */
  activeIndex?: number;
  /** 現在の一致に足すクラス。 */
  activeClassName?: string;
}

interface IndexedRange extends SearchMatchRange {
  matchIndex: number;
}

function normalizeWithOffsets(text: string): NormalizedText {
  let value = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let originalIndex = 0;

  for (const unit of splitSearchUnits(text)) {
    const start = originalIndex;
    originalIndex += unit.length;
    // フィルタ（thread-search）と同じ正規化を使い、一致範囲の表示がずれないようにする。
    // 正規化で長さが変わる（「ｶﾞ」→「が」、「㍻」→「平成」）ため、正規化後の各文字に
    // 元の単位の範囲を対応づけ、一致範囲を元の文字列の位置へ戻せるようにする。
    const normalizedUnit = normalizeSearchUnit(unit);
    value += normalizedUnit;
    for (let index = 0; index < normalizedUnit.length; index++) {
      starts.push(start);
      ends.push(originalIndex);
    }
  }

  return { value, starts, ends };
}

export function findSearchMatchRanges(text: string, query: string): SearchMatchRange[] {
  const normalizedQuery = normalizeSearchText(query);
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
  ranges: IndexedRange[],
  options: Required<Pick<HighlightOptions, "className">> & HighlightOptions,
): void {
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, range.start)));
    }

    const mark = document.createElement("mark");
    mark.className =
      range.matchIndex === options.activeIndex && options.activeClassName
        ? `${options.className} ${options.activeClassName}`
        : options.className;
    mark.textContent = text.slice(range.start, range.end);
    fragment.append(mark);
    cursor = range.end;
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }
}

function collectSearchableText(
  document: Document,
  className: string,
): {
  text: string;
  nodes: SearchableTextNode[];
} {
  let text = "";
  const nodes: SearchableTextNode[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ALL, {
    acceptNode: (node) => {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        // 同じ種類の強調を二重にかけない。別の種類の強調（検索フィルタとページ内検索）は
        // 重ねてよく、一致の数え方を stripHtml した本文と揃えるため中の文字も数える。
        (node as Element).matches(`script, style, template, mark.${className}`)
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

export function highlightSearchMatches(
  html: string,
  query: string,
  options: HighlightOptions = {},
): string {
  const className = options.className ?? SEARCH_HIGHLIGHT_CLASS;
  // 検索語が空なら元のHTMLをそのまま返し、通常表示時のDOM正規化や再描画差分を発生させない。
  if (!html || !query || typeof DOMParser === "undefined") {
    return html;
  }

  // HTML文字列の単純置換はリンク属性やアンカーHTMLまで書き換えるため、
  // DOMのテキストノードだけをmarkで包み、既存の要素と操作対象を維持する。
  const document = new DOMParser().parseFromString(html, "text/html");
  const searchableText = collectSearchableText(document, className);
  const ranges = findSearchMatchRanges(searchableText.text, query);

  let highlighted = false;
  for (const { node, start, end } of searchableText.nodes) {
    const localRanges = ranges
      .map((range, matchIndex) => ({ ...range, matchIndex }))
      .filter((range) => range.start < end && range.end > start)
      .map((range) => ({
        start: Math.max(range.start, start) - start,
        end: Math.min(range.end, end) - start,
        matchIndex: range.matchIndex,
      }));
    if (localRanges.length === 0 || !node.parentNode) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    appendHighlightedText(document, fragment, node.data, localRanges, { ...options, className });
    node.parentNode.replaceChild(fragment, node);
    highlighted = true;
  }

  return highlighted ? document.body.innerHTML : html;
}
