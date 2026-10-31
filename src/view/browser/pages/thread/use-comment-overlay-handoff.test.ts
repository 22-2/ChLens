import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { useCommentOverlayHandoff } from "src/view/browser/pages/thread/use-comment-overlay-handoff";
import type { Tab, ThreadPage as ThreadPageType } from "src/view/browser/types";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { loggerError } = vi.hoisted(() => ({ loggerError: vi.fn() }));
vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: loggerError, warn: vi.fn(), debug: vi.fn() }),
}));

const PREVIOUS_URL = "https://example.com/test/read.cgi/board/1000000001/";
const NEXT_URL = "https://example.com/test/read.cgi/board/1000000002/";
const OTHER_THREAD_URL = "https://example.com/test/read.cgi/board/1000000003/";
const OWN_RES_NUMS: ReadonlySet<number> = new Set([2]);
const RESPONSES: IRes[] = [
  { num: 1, name: "名無しさん", mail: "", date: "2026/09/30 12:00:00", message: "一つ目" },
];

type Options = Parameters<typeof useCommentOverlayHandoff>[0];

function createThreadPage(threadUrl: string): ThreadPageType {
  return { type: "thread", title: "テストスレ", threadUrl };
}

/** 直前の履歴に前のスレッドを置き、現在のスレッドを表示している状態を作る。 */
function createNavigationTab(previousPage: Tab["history"][number]): Tab {
  return {
    history: [previousPage, createThreadPage(NEXT_URL)],
    currentIndex: 1,
  } as Tab;
}

// 開始関数は、テストが呼び出しを検査できるよう、作成したオプションごとに保持する。
const startByOptions = new WeakMap<Options, ReturnType<typeof vi.fn>>();

function createOptions(overrides: Partial<Options> = {}): Options {
  const start = vi.fn().mockResolvedValue(undefined);
  const options: Options = {
    page: createThreadPage(NEXT_URL),
    responses: RESPONSES,
    loading: false,
    isOverlayTarget: true,
    isAutoRefreshEnabled: true,
    isCommentOverlayVisible: true,
    commentOverlaySnapshot: {
      state: { targetThreadUrl: PREVIOUS_URL },
    } as Options["commentOverlaySnapshot"],
    navigationTab: createNavigationTab(createThreadPage(PREVIOUS_URL)),
    commentOverlayController: { start } as unknown as Options["commentOverlayController"],
    ownResNums: OWN_RES_NUMS,
    ...overrides,
  };
  startByOptions.set(options, start);
  return options;
}

function getStart(options: Options): ReturnType<typeof vi.fn> {
  const start = startByOptions.get(options);
  if (!start) throw new Error("コメント実況の開始関数が登録されていません");
  return start;
}

describe("useCommentOverlayHandoff", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("次スレへ移動した後、直前のスレを対象にしていた実況を新しいスレへ引き継ぐ", () => {
    const options = createOptions();

    renderHook(() => useCommentOverlayHandoff(options));

    expect(getStart(options)).toHaveBeenCalledWith(NEXT_URL, RESPONSES, {
      preserveVisibleComments: true,
      ownResponseNumbers: OWN_RES_NUMS,
    });
  });

  it("実況の対象になっていないタブでは引き継がない", () => {
    const options = createOptions({ isOverlayTarget: false });

    renderHook(() => useCommentOverlayHandoff(options));

    expect(getStart(options)).not.toHaveBeenCalled();
  });

  it("自動更新が無効なら引き継がない", () => {
    const options = createOptions({ isAutoRefreshEnabled: false });

    renderHook(() => useCommentOverlayHandoff(options));

    expect(getStart(options)).not.toHaveBeenCalled();
  });

  it("実況が表示されていなければ引き継がない", () => {
    const options = createOptions({ isCommentOverlayVisible: false });

    renderHook(() => useCommentOverlayHandoff(options));

    expect(getStart(options)).not.toHaveBeenCalled();
  });

  it("新しいスレッドの取得中、またはレスがなければ引き継がない", () => {
    const loadingOptions = createOptions({ loading: true });
    renderHook(() => useCommentOverlayHandoff(loadingOptions));
    expect(getStart(loadingOptions)).not.toHaveBeenCalled();

    const emptyOptions = createOptions({ responses: [] });
    renderHook(() => useCommentOverlayHandoff(emptyOptions));
    expect(getStart(emptyOptions)).not.toHaveBeenCalled();
  });

  it("直前の履歴がスレッドでなければ引き継がない", () => {
    const options = createOptions({
      navigationTab: createNavigationTab({ type: "settings", title: "設定" }),
    });

    renderHook(() => useCommentOverlayHandoff(options));

    expect(getStart(options)).not.toHaveBeenCalled();
  });

  it("直前のスレが実況の対象と違えば引き継がない", () => {
    const options = createOptions({
      navigationTab: createNavigationTab(createThreadPage(OTHER_THREAD_URL)),
    });

    renderHook(() => useCommentOverlayHandoff(options));

    expect(getStart(options)).not.toHaveBeenCalled();
  });

  it("現在のスレッドがすでに実況の対象なら引き継がない", () => {
    const options = createOptions({
      page: createThreadPage(PREVIOUS_URL),
      navigationTab: createNavigationTab(createThreadPage(PREVIOUS_URL)),
    });

    renderHook(() => useCommentOverlayHandoff(options));

    expect(getStart(options)).not.toHaveBeenCalled();
  });

  it("引き継ぎに失敗したら、エラーをログに残す", async () => {
    const error = new Error("開始できません");
    const options = createOptions();
    getStart(options).mockRejectedValue(error);

    renderHook(() => useCommentOverlayHandoff(options));

    await waitFor(() => {
      expect(loggerError).toHaveBeenCalledWith(
        "次スレ移動後のコメント実況引き継ぎに失敗しました:",
        error,
      );
    });
  });
});
