import type { IRes } from "@chlen/ch-lib";
import { ThreadView } from "./ThreadView";

const posts: IRes[] = [
  {
    number: 1,
    name: "名無し",
    mail: "",
    date: "2026/08/29",
    id: "abc123",
    message: "配信開始\n今日もよろしく",
  },
  { number: 2, name: "名無し", mail: "", date: "2026/08/29", id: "def456", message: ">>1 きた" },
  {
    number: 3,
    name: "名無し",
    mail: "",
    date: "2026/08/29",
    id: "ghi789",
    message: "このレスは更新で追加された想定です",
  },
];

export default { title: "Live/ThreadView" };

export function Default() {
  return (
    <ThreadView
      title="ChLens Live 実況スレ"
      posts={posts}
      loading={false}
      error={null}
      datFall={false}
      onRefresh={() => undefined}
      onStop={() => undefined}
    />
  );
}

export function DatFallen() {
  return (
    <ThreadView
      title="過去ログ"
      posts={posts.slice(0, 1)}
      loading={false}
      error={null}
      datFall
      onRefresh={() => undefined}
      onStop={() => undefined}
    />
  );
}
