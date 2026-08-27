import type { BoardThread, Rule } from "@chlen/ch-lib";
import { describe, expect, it } from "vite-plus/test";
import { createThreadListRows } from "./use-thread-list-controller";

const threads: BoardThread[] = [
  {
    url: "https://example.test/1",
    title: "通常スレ",
    resCount: 4,
    createdAt: Date.now() - 86_400_000,
  },
  {
    url: "https://example.test/2",
    title: "隠すスレ",
    resCount: 12,
    createdAt: Date.now() - 86_400_000,
  },
  {
    url: "https://example.test/3",
    title: "注目スレ",
    resCount: 8,
    createdAt: Date.now() - 86_400_000,
  },
];

const rules: Rule[] = [
  {
    action: "hide",
    target: "title",
    matchers: [{ kind: "contains", value: "隠すスレ" }],
    enabled: true,
  },
  {
    action: "highlight",
    target: "title",
    matchers: [{ kind: "contains", value: "注目スレ" }],
    presentation: { label: "注目" },
    enabled: true,
  },
];

describe("createThreadListRows", () => {
  it("applies board NG rules before search and exposes highlight state", () => {
    const result = createThreadListRows(threads, rules, "", null, "asc", Date.now());

    expect(result.rows.map((row) => row.title)).toEqual(["通常スレ", "注目スレ"]);
    expect(result.rows[1]).toMatchObject({ state: "highlight", label: "注目" });
    expect(result.threadsById.get("https://example.test/1")?.title).toBe("通常スレ");
  });

  it("filters titles and sorts by response count", () => {
    const result = createThreadListRows(threads, [], "スレ", "resCount", "desc", Date.now());

    expect(result.rows.map((row) => row.title)).toEqual(["隠すスレ", "注目スレ", "通常スレ"]);
  });
});
