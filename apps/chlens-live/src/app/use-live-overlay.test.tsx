import type { IRes } from "@chlen/ch-lib";
import { act, render, screen } from "@testing-library/react";
import {
  calculateNaturalCommentFlowCount,
  calculateNaturalCommentFlowInterval,
} from "src/features/comment-overlay/domain";
import { describe, expect, it } from "vite-plus/test";

import { type LiveEvent, MemoryLiveEventBus } from "../live-session/events";
import { useLiveOverlay } from "./use-live-overlay";

const threadUrl = "https://bbs.eddibb.cc/liveedge/1000000001/";

function post(number: number, message: string): IRes {
  return {
    number,
    name: "名無し",
    mail: "",
    date: "2026/08/30",
    message,
  };
}

function snapshot(posts: IRes[]): LiveEvent {
  return {
    type: "snapshot",
    threadUrl,
    changed: true,
    snapshot: {
      url: threadUrl,
      data: { posts },
      metadata: { bodyBytes: 0, parsedResCount: posts.length },
      updatedAt: 1,
    },
  };
}

function Harness({ eventBus }: { eventBus: MemoryLiveEventBus }) {
  const { comments, stageKey, threadUrl: currentThreadUrl } = useLiveOverlay(eventBus);
  return (
    <div>
      <output data-testid="thread-url">{currentThreadUrl}</output>
      <output data-testid="stage-key">{stageKey}</output>
      <output data-testid="comments">{comments.map((comment) => comment.text).join("|")}</output>
    </div>
  );
}

describe("useLiveOverlay", () => {
  it("初回snapshotを表示せず、新着snapshotだけをOverlay入力へ渡す", async () => {
    const eventBus = new MemoryLiveEventBus();
    render(<Harness eventBus={eventBus} />);

    await act(async () => {
      await eventBus.publish(snapshot([post(1, "既存レス")]));
    });
    expect(screen.getByTestId("comments")).toHaveTextContent("");

    await act(async () => {
      await eventBus.publish(snapshot([post(1, "既存レス"), post(2, "新着レス")]));
    });
    expect(screen.getByTestId("thread-url")).toHaveTextContent(threadUrl);
    expect(screen.getByTestId("comments")).toHaveTextContent("新着レス");
  });
});

describe("コメントの自然な投入間隔", () => {
  it("通常時は取得間隔へ20%の揺らぎを加える", () => {
    const base = {
      queueSize: 10,
      batchSize: 25,
      updateIntervalMilliseconds: 10_000,
    };

    expect(calculateNaturalCommentFlowInterval({ ...base, randomValue: 0 })).toBe(320);
    expect(calculateNaturalCommentFlowInterval({ ...base, randomValue: 1 })).toBe(480);
  });

  it("低速時は300から500msの範囲で揺らす", () => {
    const base = {
      queueSize: 2,
      batchSize: 2,
      updateIntervalMilliseconds: 10_000,
    };

    expect(calculateNaturalCommentFlowInterval({ ...base, randomValue: 0 })).toBe(300);
    expect(calculateNaturalCommentFlowInterval({ ...base, randomValue: 1 })).toBe(500);
  });

  it("滞留が増えた時だけ投入間隔を縮め、同時投入数を増やす", () => {
    expect(
      calculateNaturalCommentFlowInterval({
        queueSize: 51,
        batchSize: 60,
        updateIntervalMilliseconds: 10_000,
      }),
    ).toBe(20);
    expect(calculateNaturalCommentFlowCount(10)).toBe(1);
    expect(calculateNaturalCommentFlowCount(21)).toBe(3);
    expect(calculateNaturalCommentFlowCount(51)).toBe(5);
  });
});
