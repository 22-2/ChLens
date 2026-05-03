export interface Board {
  name: string;
  url: string;
}

export interface BBSMenuCategory {
  name: string;
  boards: Board[];
}

export type BBSMenu = {
  // bbs_menu.htmlのタイトル or domain
  name: string;
  // カテゴリリスト
  categories: BBSMenuCategory[];
};

const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
};

export function parseBBSMenu(html: string): BBSMenu {
  const lines = html.split(/\r?\n/);
  const menu: BBSMenu = { name: "", categories: [] };
  let currentCategory: BBSMenuCategory | null = null;

  const titleRegex = /<TITLE>(.*?)<\/TITLE>/i;
  const categoryRegex = /<BR><BR><B>(.*?)<\/B><BR>/i;
  const boardRegex = /<A HREF=(.*?)>(.*?)<\/A>/i;

  const titleMatch = html.match(titleRegex);
  if (titleMatch && titleMatch[1]) {
    menu.name = decodeHtmlEntities(titleMatch[1].trim());
  }

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const categoryMatch = trimmedLine.match(categoryRegex);
    if (categoryMatch && categoryMatch[1]) {
      currentCategory = {
        name: decodeHtmlEntities(categoryMatch[1].trim()),
        boards: [],
      };
      menu.categories.push(currentCategory);
      continue;
    }

    if (currentCategory) {
      const boardMatch = trimmedLine.match(boardRegex);
      if (boardMatch && boardMatch[1] && boardMatch[2]) {
        const url = boardMatch[1].trim().replace(/^"|"$/g, ""); // クォートを除去
        const name = decodeHtmlEntities(boardMatch[2].trim());

        // 不要なリンクを除外
        if (
          url &&
          name &&
          !url.includes("index.html") &&
          !url.endsWith("../") &&
          !name.toLowerCase().includes("top")
        ) {
          currentCategory.boards.push({ name, url });
        }
      }
    }
  }

  menu.categories = menu.categories.filter(
    (category) => category.boards.length > 0,
  );

  return menu;
}
