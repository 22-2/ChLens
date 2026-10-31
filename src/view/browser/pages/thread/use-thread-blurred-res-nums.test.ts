import { cleanup, renderHook } from "@testing-library/react";
import { useSimilarImageNg } from "src/features/ng/browser/use-similar-image-ng";
import type { IRes } from "src/service-container/interfaces";
import { useThreadBlurredResNums } from "src/view/browser/pages/thread/use-thread-blurred-res-nums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { useSimilarImageNgMock } = vi.hoisted(() => ({ useSimilarImageNgMock: vi.fn() }));
vi.mock("src/features/ng/browser/use-similar-image-ng", () => ({
  useSimilarImageNg: useSimilarImageNgMock,
}));

const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";
const HARMFUL_PATTERN = /危険語/;

type Options = Parameters<typeof useThreadBlurredResNums>[0];

function createRes(num: number, message: string, overrides: Partial<IRes> = {}): IRes {
  return {
    num,
    name: "名無しさん",
    mail: "",
    date: "2026/09/30 12:00:00",
    message,
    ...overrides,
  };
}

function renderBlurredResNums(overrides: Partial<Options> = {}) {
  const options: Options = {
    page: { type: "thread", title: "テストスレ", threadUrl: THREAD_URL },
    responses: [createRes(3, "通常の本文"), createRes(5, "危険語を含む返信")],
    indexes: { repIndex: new Map([[3, new Set([5])]]) } as Options["indexes"],
    imageBlurConfig: { enabled: true, radius: 8, harmfulWordPattern: HARMFUL_PATTERN },
    messageProtocol: "https",
    ...overrides,
  };
  return renderHook(() => useThreadBlurredResNums(options));
}

describe("useThreadBlurredResNums", () => {
  beforeEach(() => {
    useSimilarImageNgMock.mockReturnValue(new Set<number>());
  });

  afterEach(() => {
    cleanup();
  });

  it("語句ぼかしが有効で、返信の本文が禁止語句に一致すると返信先のレスをぼかす", () => {
    const { result } = renderBlurredResNums();

    expect([...result.current]).toEqual([3]);
  });

  it("画像ぼかしが無効なら、語句による判定を行わない", () => {
    const { result } = renderBlurredResNums({
      imageBlurConfig: { enabled: false, radius: 8, harmfulWordPattern: HARMFUL_PATTERN },
    });

    expect(result.current.size).toBe(0);
  });

  it("禁止語句に一致しても、返信がNG済みなら返信先をぼかさない", () => {
    const { result } = renderBlurredResNums({
      responses: [createRes(3, "通常の本文"), createRes(5, "危険語を含む返信", { class: ["ng"] })],
    });

    expect(result.current.size).toBe(0);
  });

  it("返信先のレスが見つからなければ、語句による判定の対象にしない", () => {
    const { result } = renderBlurredResNums({
      responses: [createRes(3, "通常の本文")],
    });

    expect(result.current.size).toBe(0);
  });

  it("類似画像NGで判定されたレスは、画像ぼかしの設定に関係なくぼかす", () => {
    useSimilarImageNgMock.mockReturnValue(new Set([8]));

    const { result } = renderBlurredResNums({
      imageBlurConfig: { enabled: false, radius: 8, harmfulWordPattern: null },
    });

    expect([...result.current]).toEqual([8]);
  });

  it("語句によるぼかしと類似画像NGの結果を合わせて返す", () => {
    useSimilarImageNgMock.mockReturnValue(new Set([8]));

    const { result } = renderBlurredResNums();

    expect([...result.current].sort((a, b) => a - b)).toEqual([3, 8]);
  });

  it("類似画像NGの判定には、スレッドのタイトル・URL・レス・通信方式を渡す", () => {
    const responses = [createRes(3, "通常の本文")];

    renderBlurredResNums({ responses, messageProtocol: "https" });

    expect(useSimilarImageNg).toHaveBeenCalledWith(
      expect.objectContaining({
        responses,
        threadTitle: "テストスレ",
        threadUrl: THREAD_URL,
        messageProtocol: "https",
      }),
    );
  });
});
