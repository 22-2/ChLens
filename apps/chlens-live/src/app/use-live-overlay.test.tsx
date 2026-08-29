import { act, render, screen } from "@testing-library/react";
import type { IRes } from "@chlen/ch-lib";
import { describe, expect, it } from "vite-plus/test";
import { MemoryLiveEventBus, type LiveEvent } from "../live-session/events";
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
