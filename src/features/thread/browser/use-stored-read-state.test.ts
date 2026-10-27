import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    handlers,
    get: vi.fn(),
    container: {
      readState: { get: (url: string) => mocks.get(url) },
      message: {
        on: (name: string, handler: (payload: unknown) => void) => handlers.set(name, handler),
        off: (name: string) => handlers.delete(name),
      },
    },
  };
});
vi.mock("src/service-container/index", () => ({ container: mocks.container }));

import { useStoredReadState } from "./use-stored-read-state";

const threadUrl = "https://example.com/test/read.cgi/board/1/";

describe("保存済みの既読状態", () => {
  afterEach(() => {
    mocks.get.mockReset();
    mocks.handlers.clear();
  });

  it("保存済みの既読状態を読み、更新通知に追従する", async () => {
    mocks.get.mockResolvedValue({ url: threadUrl, last: 1, read: 1, received: 1 });
    const { result, unmount } = renderHook(() => useStoredReadState(threadUrl));
    await waitFor(() => expect(result.current?.read).toBe(1));

    act(() => {
      mocks.handlers.get("read_state_updated")?.({
        read_state: { url: "https://example.com/test/read.cgi/other/2/", read: 9 },
      });
    });
    expect(result.current?.read).toBe(1);

    act(() => {
      mocks.handlers.get("read_state_updated")?.({
        read_state: { url: threadUrl, last: 5, read: 5, received: 5 },
      });
    });
    expect(result.current?.read).toBe(5);

    act(() => mocks.handlers.get("read_state_removed")?.({ url: threadUrl }));
    expect(result.current).toBeNull();

    unmount();
    expect(mocks.handlers.size).toBe(0);
  });
});
