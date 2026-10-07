const wideSlimNormalizeReg = new RegExp(
  `[\
\
\\uff01-\\uff5d\
\
\\uff66-\\uff9d\
]+`,
  "g",
);
const kataHiraReg = new RegExp(
  `[\
\\u30a1-\\u30f3\
]`,
  "g",
);

/** 検索時に全角/半角、大文字/小文字、カタカナ/ひらがなを同じ表記へ揃える。 */
export function normalize(str: string): string {
  str = str
    .replace(wideSlimNormalizeReg, (value) => value.normalize("NFKC"))
    .replace(kataHiraReg, (value) => String.fromCharCode(value.charCodeAt(0) - 96));
  // 検索語の空白違いで結果が分かれないよう、半角・全角スペースを除去する。
  str = str.replaceAll("\u0020", "").replaceAll("\u3000", "");
  return str.toLowerCase();
}
