import { cleanup, renderHook } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { useThreadSnapshots } from "src/view/browser/state/thread-snapshot";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useThreadSnapshotPublisher } from "./use-thread-snapshot-publisher";

const mocks = vi.hoisted(() => ({ ngDisabled: false, ngMode: "hard-ng" }));
vi.mock("src/features/ng/browser/use-ng-status", () => ({
  useIsNgTemporarilyDisabled: () => mocks.ngDisabled,
  useNgDisplayMode: () => mocks.ngMode,
}));

const threadUrl = "https://example.com/thread";
const responses: IRes[] = [
  { num: 1, name: "", mail: "", date: "", message: "通常" },
  { num: 2, name: "", mail: "", date: "", message: "NG", ng: { type: "word" } },
  {
    num: 3,
    name: "",
    mail: "",
    date: "",
    message: "強調",
    ng: { type: "word", action: "collapse" },
  },
];

function options(patch: Partial<Parameters<typeof useThreadSnapshotPublisher>[0]> = {}) {
  return {
    tabId: "tab",
    enabled: true,
    threadUrl,
    responses,
    visibleResponses: responses,
    messageProtocol: "https:",
    blurredResNums: new Set<number>(),
    imageBlurRadius: 4,
    loading: false,
    error: null,
    expired: false,
    ...patch,
  };
}

function published() {
  return useThreadSnapshots.getState().entries.get("tab")?.snapshot;
}

describe("スナップショットの公開", () => {
  afterEach(() => {
    cleanup();
    mocks.ngDisabled = false;
    mocks.ngMode = "hard-ng";
    useThreadSnapshots.setState({ entries: new Map() });
  });

  it("全レスはそのまま、本文表示分は NG で隠れたレスを除いて公開する", () => {
    renderHook(() => useThreadSnapshotPublisher(options()));
    expect(published()?.responses).toHaveLength(3);
    expect(published()?.visibleResponses.map((res) => res.num)).toEqual([1]);
  });

  it("NG を一時的に無効にしている間は隠さない", () => {
    mocks.ngDisabled = true;
    renderHook(() => useThreadSnapshotPublisher(options()));
    expect(published()?.visibleResponses.map((res) => res.num)).toEqual([1, 2, 3]);
  });

  it("強調表示モードの NG は本文に出るため含める", () => {
    mocks.ngMode = "highlight-ng";
    renderHook(() => useThreadSnapshotPublisher(options()));
    // collapse ルールは全体設定にかかわらず折りたたみになるため除く。
    expect(published()?.visibleResponses.map((res) => res.num)).toEqual([1, 2]);
  });

  it("公開しない状態になったら取り下げ、アンマウントでも取り下げる", () => {
    const { rerender, unmount } = renderHook(
      (props: { enabled: boolean }) => useThreadSnapshotPublisher(options(props)),
      { initialProps: { enabled: true } },
    );
    expect(published()).toBeDefined();
    rerender({ enabled: false });
    expect(published()).toBeUndefined();
    rerender({ enabled: true });
    unmount();
    expect(published()).toBeUndefined();
  });

  it("古い画面の取り下げで、新しい画面の公開を消さない", () => {
    const first = renderHook(() => useThreadSnapshotPublisher(options()));
    renderHook(() => useThreadSnapshotPublisher(options({ threadUrl: "https://example.com/new" })));
    first.unmount();
    expect(published()?.threadUrl).toBe("https://example.com/new");
  });
});
