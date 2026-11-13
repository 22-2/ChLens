import { act, cleanup, renderHook } from "@testing-library/react";
import {
  type ImageHashEntry,
  useImageHashStore,
} from "src/features/media/browser/use-image-hash-store";
import { useSimilarImageNg } from "src/features/ng/browser/use-similar-image-ng";
import { container } from "src/service-container";
import type { IMessage, INGService, IRes } from "src/service-container/interfaces";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ngStatus = vi.hoisted(() => ({ temporarilyDisabled: false }));
vi.mock("src/features/ng/browser/use-ng-status", () => ({
  useIsNgTemporarilyDisabled: () => ngStatus.temporarilyDisabled,
}));

const ngConfig = vi.hoisted(() => ({ excludeFirstResponse: false }));
vi.mock("src/view/browser/hooks/use-config-boolean-setting", () => ({
  useConfigBooleanSetting: (key: string) => ({
    value: key === "ng_exclude_first_response" ? ngConfig.excludeFirstResponse : false,
    setValue: vi.fn(),
  }),
}));

const IMAGE_URL = "https://images.example.com/a.jpg";
const responses: IRes[] = [
  { num: 1, name: "", mail: "", date: "", message: "画像なし" },
  { num: 2, name: "", mail: "", date: "", message: IMAGE_URL },
];
const options = {
  responses,
  threadTitle: "スレ",
  threadUrl: "https://example.com/test/read.cgi/board/1/",
  messageProtocol: "https:",
};

let ngChangedHandler: (() => void) | null = null;
const hasImageRules = vi.fn<() => boolean>();
const isSimilarImageNG = vi.fn<INGService["isSimilarImageNG"]>();
const isSimilarImageResponseNG = vi.fn<INGService["isSimilarImageResponseNG"]>();

const READY_ENTRIES = new Map<string, ImageHashEntry>([
  [IMAGE_URL, { status: "ready", hash: "0123456789abcdef" }],
]);

describe("類似画像NGでぼかすレス", () => {
  beforeEach(() => {
    ngStatus.temporarilyDisabled = false;
    ngConfig.excludeFirstResponse = false;
    hasImageRules.mockReset().mockReturnValue(true);
    isSimilarImageNG.mockReset().mockReturnValue({ type: "SimilarImage", action: "blur" });
    isSimilarImageResponseNG.mockReset().mockReturnValue(null);
    ngChangedHandler = null;
    container.ng = {
      isNGBoard: vi.fn().mockReturnValue(null),
      isNGThread: vi.fn().mockReturnValue(null),
      hasImageRules,
      hasImageHash: vi.fn().mockReturnValue(false),
      isSimilarImageNG,
      isSimilarImageResponseNG,
      add: vi.fn(),
      invalidateCache: vi.fn(),
      execExpire: vi.fn(),
    };
    container.message = {
      send: vi.fn(),
      on: vi.fn((type: string, handler: () => void) => {
        if (type === "ng_changed") ngChangedHandler = handler;
      }),
      off: vi.fn(),
    } as unknown as IMessage;
    useImageHashStore.setState({ hashingEnabled: false, entries: new Map() });
  });

  afterEach(() => {
    cleanup();
  });

  it("ルールがなければハッシュを計算させず、どのレスもぼかさない", () => {
    hasImageRules.mockReturnValue(false);
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(useImageHashStore.getState().hashingEnabled).toBe(false);
    expect(result.current.blurredResNums.size).toBe(0);
    expect(result.current.responseNgByNum.size).toBe(0);
  });

  it("ルールがあればハッシュを計算させ、出たハッシュでレスを判定する", () => {
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(useImageHashStore.getState().hashingEnabled).toBe(true);
    expect(result.current.blurredResNums.size).toBe(0);
    expect(isSimilarImageNG).not.toHaveBeenCalled();

    // ハッシュが出た描画で、そのままぼかす対象になる（effectで遅らせない）。
    act(() => {
      useImageHashStore.setState({ entries: READY_ENTRIES });
    });
    expect(result.current.blurredResNums).toEqual(new Set([2]));
    expect(isSimilarImageNG).toHaveBeenCalledWith(
      responses[1],
      options.threadTitle,
      options.threadUrl,
      ["0123456789abcdef"],
    );
  });

  it("似ていなければぼかさない", () => {
    isSimilarImageNG.mockReturnValue(null);
    useImageHashStore.setState({ entries: READY_ENTRIES });
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(result.current.blurredResNums.size).toBe(0);
  });

  it("NGの一時解除中はハッシュを計算させず、ぼかさない", () => {
    ngStatus.temporarilyDisabled = true;
    useImageHashStore.setState({ entries: READY_ENTRIES });
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(useImageHashStore.getState().hashingEnabled).toBe(false);
    expect(result.current.blurredResNums.size).toBe(0);
  });

  it("NGの変更を受けて、ルールの有無と判定をやり直す", () => {
    useImageHashStore.setState({ entries: READY_ENTRIES });
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(result.current.blurredResNums).toEqual(new Set([2]));

    hasImageRules.mockReturnValue(false);
    act(() => ngChangedHandler?.());
    expect(useImageHashStore.getState().hashingEnabled).toBe(false);
    expect(result.current.blurredResNums.size).toBe(0);

    hasImageRules.mockReturnValue(true);
    isSimilarImageNG.mockReturnValue(null);
    act(() => ngChangedHandler?.());
    expect(result.current.blurredResNums.size).toBe(0);
  });

  it("画像で隠す・折りたたむレスは、その結果をレス番号ごとに返す", () => {
    const hideResult = { type: "SimilarImage", action: "hide", ruleIndex: 0 } as const;
    isSimilarImageNG.mockReturnValue(null);
    isSimilarImageResponseNG.mockReturnValue(hideResult);
    useImageHashStore.setState({ entries: READY_ENTRIES });

    const { result } = renderHook(() => useSimilarImageNg(options));

    expect(result.current.blurredResNums.size).toBe(0);
    expect(result.current.responseNgByNum).toEqual(new Map([[2, hideResult]]));
    expect(isSimilarImageResponseNG).toHaveBeenCalledWith(
      responses[1],
      options.threadTitle,
      options.threadUrl,
      ["0123456789abcdef"],
    );
  });

  it("ぼかしの理由は、ルールの名前（label）を使い、名前がなければ既定の名前を使う", () => {
    isSimilarImageNG.mockReturnValue({
      type: "SimilarImage",
      action: "blur",
      params: { label: "定期画像" },
    });
    useImageHashStore.setState({ entries: READY_ENTRIES });
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(result.current.blurReasonByNum).toEqual(new Map([[2, "NGルール: 定期画像"]]));

    isSimilarImageNG.mockReturnValue({ type: "SimilarImage", action: "blur" });
    act(() => ngChangedHandler?.());
    expect(result.current.blurReasonByNum).toEqual(new Map([[2, "NGルール: 類似画像"]]));
  });

  it("ハッシュが出ていないレスは、隠す・折りたたむ判定の対象にしない", () => {
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(isSimilarImageResponseNG).not.toHaveBeenCalled();
    expect(result.current.responseNgByNum.size).toBe(0);
  });

  describe(">>1をNG対象から除外する設定", () => {
    const firstImageResponses: IRes[] = [
      { num: 1, name: "", mail: "", date: "", message: IMAGE_URL },
      { num: 2, name: "", mail: "", date: "", message: IMAGE_URL },
    ];
    const firstImageOptions = { ...options, responses: firstImageResponses };
    const hideResult = { type: "SimilarImage", action: "hide", ruleIndex: 0 } as const;

    beforeEach(() => {
      isSimilarImageResponseNG.mockReturnValue(hideResult);
      useImageHashStore.setState({ entries: READY_ENTRIES });
    });

    it("有効なら、画像が一致しても>>1はぼかさず、隠す・折りたたむ対象にもしない", () => {
      ngConfig.excludeFirstResponse = true;
      const { result } = renderHook(() => useSimilarImageNg(firstImageOptions));

      expect(result.current.blurredResNums).toEqual(new Set([2]));
      expect(result.current.blurReasonByNum.has(1)).toBe(false);
      expect(result.current.responseNgByNum).toEqual(new Map([[2, hideResult]]));
      expect(isSimilarImageNG).not.toHaveBeenCalledWith(
        firstImageResponses[0],
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("無効なら、>>1も他のレスと同じく判定する", () => {
      const { result } = renderHook(() => useSimilarImageNg(firstImageOptions));

      expect(result.current.blurredResNums).toEqual(new Set([1, 2]));
      expect(result.current.responseNgByNum).toEqual(
        new Map([
          [1, hideResult],
          [2, hideResult],
        ]),
      );
    });
  });
});
