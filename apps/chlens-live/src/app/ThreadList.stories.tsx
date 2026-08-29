import type { BoardThread } from "@chlen/ch-lib";
import { useState } from "react";
import { ThreadList } from "./ThreadList";

const threads: BoardThread[] = [
  { url: "https://example.com/live/1", title: "実況スレ ★1", resCount: 120, createdAt: 1 },
  { url: "https://example.com/live/2", title: "雑談スレ", resCount: 45, createdAt: 2 },
  { url: "https://example.com/live/3", title: "今日のニュース", resCount: 8, createdAt: 3 },
];

export default { title: "Live/ThreadList" };

export function Default() {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(threads[0].url);
  return (
    <ThreadList
      threads={threads}
      loading={false}
      error={null}
      selectedUrl={selectedUrl}
      onSelect={(thread) => setSelectedUrl(thread.url)}
    />
  );
}

export function Loading() {
  return (
    <ThreadList threads={[]} loading error={null} selectedUrl={null} onSelect={() => undefined} />
  );
}

export function ErrorState() {
  return (
    <ThreadList
      threads={[]}
      loading={false}
      error={new Error("fixture")}
      selectedUrl={null}
      onSelect={() => undefined}
    />
  );
}
