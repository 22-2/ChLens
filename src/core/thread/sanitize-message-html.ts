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
