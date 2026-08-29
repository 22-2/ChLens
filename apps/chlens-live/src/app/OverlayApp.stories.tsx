import { useEffect, useMemo } from "react";
import type { IRes } from "@chlen/ch-lib";
import { MemoryLiveEventBus, type LiveEvent } from "../live-session/events";
import { OverlayApp } from "./OverlayApp";

const threadUrl = "https://bbs.eddibb.cc/liveedge/1787442313/";

function snapshot(posts: IRes[]): LiveEvent {
  return {
    type: "snapshot",
    threadUrl,
    changed: true,
    snapshot: {
      url: threadUrl,
      data: { title: "Overlay実スレ接続fixture", posts },
      metadata: { bodyBytes: 0, parsedResCount: posts.length },
      updatedAt: Date.now(),
    },
  };
}

const initialPosts: IRes[] = [
  { number: 1, name: "名無し", mail: "", date: "2026/08/30", message: "実況開始" },
];

export default { title: "Live/OverlayApp" };

/** LiveThreadSessionのsnapshotをOverlayAppへ渡し、新着だけが流れることを確認するfixture。 */
export function LiveStream() {
  const eventBus = useMemo(() => new MemoryLiveEventBus(), []);

  useEffect(() => {
    let posts = initialPosts;
    const initialTimer = window.setTimeout(() => {
      void eventBus.publish(snapshot(posts));
    }, 100);
    const timer = window.setInterval(() => {
      const nextNumber = posts.length + 1;
      posts = [
        ...posts,
        {
          number: nextNumber,
          name: "実況民",
          mail: "",
          date: "2026/08/30",
          id: `fixture-${nextNumber}`,
          message: `新着レス ${nextNumber} がOverlayへ流れます`,
        },
      ];
      void eventBus.publish(snapshot(posts));
    }, 1_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [eventBus]);

  return <OverlayApp eventBus={eventBus} />;
}
