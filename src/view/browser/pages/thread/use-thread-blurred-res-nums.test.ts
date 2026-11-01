import { cleanup, renderHook } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { useThreadBlurredResNums } from "src/view/browser/pages/thread/use-thread-blurred-res-nums";
import { afterEach, describe, expect, it } from "vite-plus/test";

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
    responses: [createRes(3, "通常の本文"), createRes(5, "危険語を含む返信")],
    indexes: { repIndex: new Map([[3, new Set([5])]]) } as Options["indexes"],
    imageBlurConfig: { enabled: true, radius: 8, harmfulWordPattern: HARMFUL_PATTERN },
    similarImageBlurredResNums: new Set<number>(),
    ...overrides,
  };
  return renderHook(() => useThreadBlurredResNums(options));
}

describe("useThreadBlurredResNums", () => {
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

  it("類似画像NGでぼかすレスは、画像ぼかしの設定に関係なくぼかす", () => {
    const { result } = renderBlurredResNums({
      imageBlurConfig: { enabled: false, radius: 8, harmfulWordPattern: null },
      similarImageBlurredResNums: new Set([8]),
    });

    expect([...result.current]).toEqual([8]);
  });

  it("語句によるぼかしと類似画像NGの結果を合わせて返す", () => {
    const { result } = renderBlurredResNums({
      similarImageBlurredResNums: new Set([8]),
    });

    expect([...result.current].sort((a, b) => a - b)).toEqual([3, 8]);
  });
});
