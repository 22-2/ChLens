import type { IRes } from "src/service-container";
import type { ResolvedTheme } from "src/view/browser/hooks/use-theme";
import { formatIdForCopy, stripHtml } from "src/view/browser/utils/response-format";

interface ResponseImagePalette {
  background: string;
  title: string;
  cardFill: string;
  cardStroke: string;
  cardHeader: string;
  cardDate: string;
  cardBody: string;
  footer: string;
}

interface ResponseImageCard {
  res: IRes;
  y: number;
  height: number;
  headerLine: string;
  dateLine: string;
  bodyLines: string[];
}

export interface ResponseListImageOptions {
  title: string;
  threadTitle?: string;
  threadUrl?: string;
  theme?: ResolvedTheme;
}

const RESPONSE_IMAGE_LAYOUT = {
  width: 960,
  paddingX: 24,
  paddingY: 22,
  titleHeight: 36,
  cardGap: 12,
  cardPaddingX: 16,
  cardPaddingY: 12,
  cardHeaderGap: 6,
  lineHeight: 20,
} as const;

const RESPONSE_IMAGE_PALETTE: Record<ResolvedTheme, ResponseImagePalette> = {
  light: {
    background: "#f7f9fc",
    title: "#111827",
    cardFill: "#ffffff",
    cardStroke: "#d7deea",
    cardHeader: "#162033",
    cardDate: "#5b6475",
    cardBody: "#1f2937",
    footer: "#6b7280",
  },
  dark: {
    background: "#292a2d",
    title: "#e8eaed",
    cardFill: "#333438",
    cardStroke: "#3c4043",
    cardHeader: "#e8eaed",
    cardDate: "#9aa0a6",
    cardBody: "#cdd0d5",
    footer: "#9aa0a6",
  },
};

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const paragraphs = normalized.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }

    let currentLine = "";
    for (const char of Array.from(paragraph)) {
      const nextLine = `${currentLine}${char}`;
      if (currentLine.length > 0 && context.measureText(nextLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = char;
        continue;
      }
      currentLine = nextLine;
    }
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function buildResponseImageCards(
  context: CanvasRenderingContext2D,
  responses: IRes[],
): { cards: ResponseImageCard[]; cardsEnd: number } {
  const cards: ResponseImageCard[] = [];
  let currentY =
    RESPONSE_IMAGE_LAYOUT.paddingY +
    RESPONSE_IMAGE_LAYOUT.titleHeight +
    RESPONSE_IMAGE_LAYOUT.cardGap;

  for (const res of responses) {
    const bodyLines = wrapCanvasText(
      context,
      stripHtml(res.message),
      RESPONSE_IMAGE_LAYOUT.width -
        RESPONSE_IMAGE_LAYOUT.paddingX * 2 -
        RESPONSE_IMAGE_LAYOUT.cardPaddingX * 2,
    );
    const height =
      RESPONSE_IMAGE_LAYOUT.cardPaddingY * 2 +
      RESPONSE_IMAGE_LAYOUT.lineHeight * (2 + bodyLines.length) +
      RESPONSE_IMAGE_LAYOUT.cardHeaderGap;
    const id = formatIdForCopy(res.id);

    cards.push({
      res,
      y: currentY,
      height,
      headerLine: `${res.num} ${stripHtml(res.name)}${id ? ` ${id}` : ""}`,
      dateLine: res.date ?? res.other ?? "",
      bodyLines,
    });
    currentY += height + RESPONSE_IMAGE_LAYOUT.cardGap;
  }

  return {
    cards,
    cardsEnd: currentY - RESPONSE_IMAGE_LAYOUT.cardGap,
  };
}

function drawResponseImageCard(
  context: CanvasRenderingContext2D,
  card: ResponseImageCard,
  palette: ResponseImagePalette,
): void {
  const cardX = RESPONSE_IMAGE_LAYOUT.paddingX;
  const cardWidth = RESPONSE_IMAGE_LAYOUT.width - RESPONSE_IMAGE_LAYOUT.paddingX * 2;

  context.fillStyle = palette.cardFill;
  context.strokeStyle = palette.cardStroke;
  context.lineWidth = 1;
  context.fillRect(cardX, card.y, cardWidth, card.height);
  context.strokeRect(cardX, card.y, cardWidth, card.height);

  let textY = card.y + RESPONSE_IMAGE_LAYOUT.cardPaddingY + 14;
  context.font = "600 15px sans-serif";
  context.fillStyle = palette.cardHeader;
  context.fillText(card.headerLine, cardX + RESPONSE_IMAGE_LAYOUT.cardPaddingX, textY);

  textY += RESPONSE_IMAGE_LAYOUT.lineHeight;
  context.font = "12px sans-serif";
  context.fillStyle = palette.cardDate;
  context.fillText(card.dateLine, cardX + RESPONSE_IMAGE_LAYOUT.cardPaddingX, textY);

  textY += RESPONSE_IMAGE_LAYOUT.cardHeaderGap + 6;
  context.font = "14px sans-serif";
  context.fillStyle = palette.cardBody;
  for (const line of card.bodyLines) {
    textY += RESPONSE_IMAGE_LAYOUT.lineHeight;
    context.fillText(line, cardX + RESPONSE_IMAGE_LAYOUT.cardPaddingX, textY);
  }
}

/** IDポップアップなど、レスの並びをそのまま画像へ書き出す。 */
export function renderResponseListImageCanvas(
  responses: IRes[],
  { title, threadTitle, threadUrl, theme = "light" }: ResponseListImageOptions,
): HTMLCanvasElement {
  if (responses.length === 0) {
    throw new Error("画像化するレスがありません");
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D contextを取得できませんでした");
  }

  const palette = RESPONSE_IMAGE_PALETTE[theme];
  const { cards, cardsEnd } = buildResponseImageCards(context, responses);
  const footerLines = [threadTitle, threadUrl].filter((value): value is string => value != null);
  const footerHeight =
    footerLines.length > 0
      ? RESPONSE_IMAGE_LAYOUT.paddingY + RESPONSE_IMAGE_LAYOUT.lineHeight * footerLines.length
      : 0;
  const totalHeight = cardsEnd + RESPONSE_IMAGE_LAYOUT.paddingY + footerHeight;
  const dpr = 1.2;

  canvas.width = Math.round(RESPONSE_IMAGE_LAYOUT.width * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  canvas.style.width = `${RESPONSE_IMAGE_LAYOUT.width}px`;
  canvas.style.height = `${totalHeight}px`;

  context.scale(dpr, dpr);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, RESPONSE_IMAGE_LAYOUT.width, totalHeight);

  context.font = "600 22px sans-serif";
  context.fillStyle = palette.title;
  context.fillText(title, RESPONSE_IMAGE_LAYOUT.paddingX, RESPONSE_IMAGE_LAYOUT.paddingY + 22);

  for (const card of cards) {
    drawResponseImageCard(context, card, palette);
  }

  if (footerLines.length > 0) {
    let footerY = cardsEnd + RESPONSE_IMAGE_LAYOUT.paddingY + RESPONSE_IMAGE_LAYOUT.lineHeight;
    context.font = "13px sans-serif";
    context.fillStyle = palette.footer;
    for (const line of footerLines) {
      context.fillText(line, RESPONSE_IMAGE_LAYOUT.paddingX, footerY);
      footerY += RESPONSE_IMAGE_LAYOUT.lineHeight;
    }
  }

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("画像Blobを作成できませんでした"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
