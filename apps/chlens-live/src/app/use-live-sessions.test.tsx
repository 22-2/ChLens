import { describe, expect, it, vi } from "vite-plus/test";
import { render, act } from "@testing-library/react";
import { useEffect, useState } from "react";
import { useLiveBoard } from "./use-live-sessions";
import type { ChLensLiveSource } from "../live-session/source";
import type { BoardThread, ChFetchResult } from "@chlen/ch-lib";

function createMockSource() {
  const boardData: BoardThread[] = [
    { url: "https://example.com/t/1", title: "スレ1", resCount: 1, createdAt: 1 },
  ];
  const loadBoardWithMetadata = vi.fn(
    async (): Promise<ChFetchResult<BoardThread[]>> => ({
      data: boardData,
      metadata: { bodyBytes: 0 },
    }),
  );
  const source: ChLensLiveSource = {
    loadBoard: async () => boardData,
    loadBoardWithMetadata,
    loadThread: async () => ({ posts: [] }),
    loadThreadWithMetadata: async () => ({
      data: { posts: [] },
      metadata: { bodyBytes: 0 },
    }),
  };
  return { source, loadBoardWithMetadata };
}

/**
 * 無限リクエスト回帰テスト。
 *
 * 親が頻繁に再レンダーしても、sessionのstart（=HTTPリクエスト）は
 * url単位で一度だけ発火しなければならない。inline subscribe関数が
 * effect依存に入っていた過去実装では、setEvent→再レンダー→effect再実行
 * のループでリクエストが無限に繰り返されていた。
 */
describe("useLiveBoard 無限リクエスト防止", () => {
  it("親の再レンダーが連続してもboard取得は1回だけ", async () => {
    const { source, loadBoardWithMetadata } = createMockSource();

    function Wrapper() {
      const [, forceRender] = useState(0);
      useLiveBoard("https://example.com/board/", { source });
      // 実際のUI更新（status表示など）で親が再レンダーされる状況を模擬する。
      useEffect(() => {
        const id = setInterval(() => forceRender((n) => n + 1), 10);
        return () => clearInterval(id);
      }, []);
      return null;
    }

    render(<Wrapper />);
    // 再レンダーが数回起こる時間を待つ
    await act(() => new Promise((resolve) => setTimeout(resolve, 80)));

    expect(loadBoardWithMetadata).toHaveBeenCalledTimes(1);
  });

  it("urlが変わった時だけ再取得する", async () => {
    const { source, loadBoardWithMetadata } = createMockSource();

    function Wrapper({ url }: { url: string }) {
      useLiveBoard(url, { source });
      return null;
    }

    const { rerender } = render(<Wrapper url="https://example.com/a/" />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    rerender(<Wrapper url="https://example.com/a/" />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    rerender(<Wrapper url="https://example.com/b/" />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(loadBoardWithMetadata).toHaveBeenCalledTimes(2);
  });
});
