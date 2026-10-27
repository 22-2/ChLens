import { act, cleanup, renderHook } from "@testing-library/react";
import { useImageHashStore } from "src/features/media/browser/use-image-hash-store";
import { useSimilarImageNg } from "src/features/ng/browser/use-similar-image-ng";
import { container } from "src/service-container";
import type { IMessage, INGService, IRes } from "src/service-container/interfaces";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ngStatus = vi.hoisted(() => ({ temporarilyDisabled: false }));
vi.mock("src/features/ng/browser/use-ng-status", () => ({
  useIsNgTemporarilyDisabled: () => ngStatus.temporarilyDisabled,
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

describe("類似画像NGでぼかすレス", () => {
  beforeEach(() => {
    ngStatus.temporarilyDisabled = false;
    hasImageRules.mockReset().mockReturnValue(true);
    isSimilarImageNG.mockReset().mockReturnValue({ type: "SimilarImage", action: "blur" });
    ngChangedHandler = null;
    container.ng = {
      isNGBoard: vi.fn().mockReturnValue(null),
      isNGThread: vi.fn().mockReturnValue(null),
      hasImageRules,
      isSimilarImageNG,
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
    expect(result.current.size).toBe(0);
  });

  it("ルールがあればハッシュを計算させ、出たハッシュでレスを判定する", () => {
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(useImageHashStore.getState().hashingEnabled).toBe(true);
    expect(result.current.size).toBe(0);
    expect(isSimilarImageNG).not.toHaveBeenCalled();

    // ハッシュが出た描画で、そのままぼかす対象になる（effectで遅らせない）。
    act(() => {
      useImageHashStore.setState({
        entries: new Map([[IMAGE_URL, { status: "ready", hash: "0123456789abcdef" }]]),
      });
    });
    expect(result.current).toEqual(new Set([2]));
    expect(isSimilarImageNG).toHaveBeenCalledWith(
      responses[1],
      options.threadTitle,
      options.threadUrl,
      ["0123456789abcdef"],
    );
  });

  it("似ていなければぼかさない", () => {
    isSimilarImageNG.mockReturnValue(null);
    useImageHashStore.setState({
      entries: new Map([[IMAGE_URL, { status: "ready", hash: "0123456789abcdef" }]]),
    });
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(result.current.size).toBe(0);
  });

  it("NGの一時解除中はハッシュを計算させず、ぼかさない", () => {
    ngStatus.temporarilyDisabled = true;
    useImageHashStore.setState({
      entries: new Map([[IMAGE_URL, { status: "ready", hash: "0123456789abcdef" }]]),
    });
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(useImageHashStore.getState().hashingEnabled).toBe(false);
    expect(result.current.size).toBe(0);
  });

  it("NGの変更を受けて、ルールの有無と判定をやり直す", () => {
    useImageHashStore.setState({
      entries: new Map([[IMAGE_URL, { status: "ready", hash: "0123456789abcdef" }]]),
    });
    const { result } = renderHook(() => useSimilarImageNg(options));
    expect(result.current).toEqual(new Set([2]));

    hasImageRules.mockReturnValue(false);
    act(() => ngChangedHandler?.());
    expect(useImageHashStore.getState().hashingEnabled).toBe(false);
    expect(result.current.size).toBe(0);

    hasImageRules.mockReturnValue(true);
    isSimilarImageNG.mockReturnValue(null);
    act(() => ngChangedHandler?.());
    expect(result.current.size).toBe(0);
  });
});
