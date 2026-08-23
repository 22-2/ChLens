import {
  ChFetcher,
  type BoardThread,
  type ChFetchResult,
  type HttpRequest,
  type ThreadData,
} from "@chlen/ch-lib";
import { TauriHttpClient } from "./tauri-http-client";

export interface ChLensLiveFetcher {
  fetchBoard(url: string): Promise<BoardThread[]>;
  fetchBoardWithMetadata(url: string, request?: HttpRequest): Promise<ChFetchResult<BoardThread[]>>;
  fetchThread(url: string): Promise<ThreadData>;
  fetchThreadWithMetadata(url: string, request?: HttpRequest): Promise<ChFetchResult<ThreadData>>;
}

export interface ChLensLiveSource {
  loadBoard(url: string): Promise<BoardThread[]>;
  loadBoardWithMetadata(url: string, request?: HttpRequest): Promise<ChFetchResult<BoardThread[]>>;
  loadThread(url: string): Promise<ThreadData>;
  loadThreadWithMetadata(url: string, request?: HttpRequest): Promise<ChFetchResult<ThreadData>>;
}

/**
 * Composition boundary for the future Live session.
 *
 * The spike keeps fetching out of React and gives the later session a single place to replace
 * browser/Tauri transport without duplicating URL normalization or parser calls.
 */
export function createChLensLiveSource(
  fetcher: ChLensLiveFetcher = new ChFetcher(),
): ChLensLiveSource {
  return {
    loadBoard: (url) => fetcher.fetchBoard(url),
    loadBoardWithMetadata: (url, request) => fetcher.fetchBoardWithMetadata(url, request),
    loadThread: (url) => fetcher.fetchThread(url),
    loadThreadWithMetadata: (url, request) => fetcher.fetchThreadWithMetadata(url, request),
  };
}

/**
 * Compose the same source boundary with Tauri's Rust-side HTTP transport.
 *
 * Keeping this factory next to the browser-default factory lets the future session choose its
 * runtime transport once, instead of spreading Tauri checks through board and thread code.
 */
export function createTauriChLensLiveSource(): ChLensLiveSource {
  return createChLensLiveSource(new ChFetcher(new TauriHttpClient()));
}
