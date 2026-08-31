import type { ThreadListViewRow } from "../../../../src/view/shared/ThreadListView";
import { LiveThreadList } from "./LiveThreadList";

const rows: ThreadListViewRow[] = [
  { id: "live-1", num: 1, title: "実況スレ ★1", resCount: 120, heat: 14.2 },
  { id: "live-2", num: 2, title: "雑談スレ", resCount: 45, heat: 5.1 },
  { id: "live-3", num: 3, title: "今日のニュース", resCount: 8, heat: 0.8 },
];

export default { title: "Live/ThreadList" };

export function Default() {
  return (
    <LiveThreadList
      rows={rows}
      loading={false}
      error={null}
      query=""
      onQueryChange={() => undefined}
      filterOpen={false}
      onFilterClose={() => undefined}
      onSelect={() => undefined}
      onMiddleClick={() => undefined}
      sortColumn={null}
      sortDirection="asc"
      onSort={() => undefined}
    />
  );
}

export function Loading() {
  return (
    <LiveThreadList
      rows={[]}
      loading
      error={null}
      query=""
      onQueryChange={() => undefined}
      filterOpen={false}
      onFilterClose={() => undefined}
      sortColumn={null}
      sortDirection="asc"
      onSort={() => undefined}
    />
  );
}

export function FilterOpen() {
  return (
    <LiveThreadList
      rows={rows}
      loading={false}
      error={null}
      query="実況"
      onQueryChange={() => undefined}
      filterOpen
      onFilterClose={() => undefined}
      sortColumn={null}
      sortDirection="asc"
      onSort={() => undefined}
    />
  );
}

export function ErrorState() {
  return (
    <LiveThreadList
      loading={false}
      error="fixture"
      rows={[]}
      query=""
      onQueryChange={() => undefined}
      filterOpen={false}
      onFilterClose={() => undefined}
      sortColumn={null}
      sortDirection="asc"
      onSort={() => undefined}
    />
  );
}
