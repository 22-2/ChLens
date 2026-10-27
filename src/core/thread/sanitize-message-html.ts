import DOMPurify from "dompurify";

// 意図: 掲示板サーバーが返す本文は信頼できないため、innerHTML へ渡す前に許可リストで再構築する。
// CSP（script-src 'self'）だけに頼ると、img/iframe/form/style による追跡やフィッシングの余地が残る。
// 古い板の装飾に使われる最小限のタグだけを通し、それ以外は子要素のテキストを残して落とす。
const ALLOWED_TAGS = [
  "a",
  "b",
  "br",
  "em",
  "font",
  "hr",
  "i",
  "small",
  "span",
  "strong",
  "u",
  "wbr",
];

// アプリが生成するアンカー（role/tabindex/class/data-disabled-reason）と、
// 外部リンク（href/target/rel）、旧来の色指定（font の color）だけを許可する。
// style 属性は CSS による見た目の偽装や外部リソース読み込みに使えるため通さない。
const ALLOWED_ATTR = [
  "class",
  "color",
  "data-disabled-reason",
  "href",
  "rel",
  "role",
  "tabindex",
  "target",
];

export function sanitizeMessageHtml(html: string): string {
  // DOMPurify は DOM が無い環境だと入力をそのまま返すため、黙って素通しにせず失敗させる。
  if (!DOMPurify.isSupported) {
    throw new Error("DOMPurify が使えない環境でレス本文のサニタイズを実行できません");
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}

export function sanitizeNameHtml(html: string, trip?: string): string {
  if (!DOMPurify.isSupported) {
    throw new Error("DOMPurify が使えない環境で名前欄のサニタイズを実行できません");
  }

  // 本文とは許可する装飾が異なるため、同じ DOMPurify に名前欄専用の許可リストを渡す。
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["b", "small", "font", "span"],
    ALLOWED_ATTR: ["color", "style"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const element of fragment.querySelectorAll("*")) {
    const style = element.getAttribute("style");
    // DOMPurify は CSS の安全性を検証しないので、従来許していた色指定だけに絞る。
    if (element.localName !== "span" || !style || !/^color:\s*[#a-zA-Z0-9]+;?$/i.test(style)) {
      element.removeAttribute("style");
    }
    const color = element.getAttribute("color");
    if (element.localName !== "font" || !color || !/^[#a-zA-Z0-9]+$/.test(color)) {
      element.removeAttribute("color");
    }
  }

  if (trip) {
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.textContent ?? "";
      const index = value.indexOf(trip);
      if (index < 0) continue;
      const highlighted = document.createElement("span");
      highlighted.className = "trip";
      highlighted.textContent = trip;
      (node as Text).replaceWith(
        document.createTextNode(value.slice(0, index)),
        highlighted,
        document.createTextNode(value.slice(index + trip.length)),
      );
      break;
    }
  }
  const container = document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
}
