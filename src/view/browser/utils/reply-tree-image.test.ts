import type { IRes } from "src/service-container";
import { renderReplyTreeImageCanvas } from "src/view/browser/utils/reply-tree-image";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function createRes(num: number, message = `message-${num}`): IRes {
  return {
    num,
    name: `name-${num}`,
    mail: "",
    date: "2026/04/19(日) 12:00:00.000",
    id: `id-${num}`,
    message,
  };
}

describe("renderReplyTreeImageCanvas", () => {
  const contextStub = {
    beginPath: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    moveTo: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: "",
    font: "",
    lineWidth: 1,
    strokeStyle: "",
  };

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => contextStub as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    contextStub.fillText.mockClear();
    contextStub.strokeRect.mockClear();
  });

  const drawnTexts = () => contextStub.fillText.mock.calls.map(([text]) => text as string);

  it("見出しを省略すると起点レス番号の返信ツリーとして描画する", () => {
    renderReplyTreeImageCanvas(createRes(7), []);

    expect(drawnTexts().slice(0, 3)).toEqual([">>7 への返信ツリー", "参照元レス", "返信レス"]);
    expect(drawnTexts()).toContain("7 name-7 ID:id-7");
  });

  it("スレタイとURLを渡した時だけ画像下部に付加し、その分だけ高さを伸ばす", () => {
    const withoutFooter = renderReplyTreeImageCanvas(createRes(1), [], { quality: "low" });
    const withFooter = renderReplyTreeImageCanvas(createRes(1), [], {
      quality: "low",
      threadTitle: "テストスレタイ",
      threadUrl: "https://example.com/test/read.cgi/board/123/",
    });

    // フッターは上下余白1つ分と2行分の高さを持つ。
    expect(withFooter.height - withoutFooter.height).toBe(22 + 20 * 2);
    expect(drawnTexts().slice(-2)).toEqual([
      "テストスレタイ",
      "https://example.com/test/read.cgi/board/123/",
    ]);
  });

  it("返信カードは深さに応じて字下げし、一定の深さで字下げを止める", () => {
    renderReplyTreeImageCanvas(createRes(1), [
      { res: createRes(2), depth: 0 },
      { res: createRes(3), depth: 1 },
      { res: createRes(4), depth: 30 },
    ]);

    const cardXs = contextStub.strokeRect.mock.calls.map(([x]) => x as number);
    // 先頭は参照元レスのカード。
    expect(cardXs).toEqual([24, 24, 24 + 22, 24 + 22 * 9]);
  });

  it("quality に応じて canvas の実ピクセル数を拡大する", () => {
    const canvas = renderReplyTreeImageCanvas(createRes(1), [], { quality: "high" });

    expect(canvas.width).toBe(960 * 4);
    expect(canvas.style.width).toBe("960px");
  });
});
