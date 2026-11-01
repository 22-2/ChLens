// @vitest-environment node
import type { INGResult } from "src/service-container";
import { describe, expect, it } from "vite-plus/test";

import { buildDemotedThreadSections } from "./thread-list-demoted-sections";

interface Row {
  name: string;
  demoted?: INGResult;
}

const collapsed = (name: string, ruleIndex?: number, label?: string): Row => ({
  name,
  demoted: {
    type: "Title",
    action: "collapse",
    ...(ruleIndex != null ? { ruleIndex } : {}),
    ...(label != null ? { params: { label } } : {}),
  },
});

const getResult = (row: Row) => row.demoted;
const namesOf = (sections: ReturnType<typeof buildDemotedThreadSections<Row>>) =>
  sections.map((section) => ({
    key: section.key,
    label: section.label,
    names: section.rows.map((row) => row.name),
  }));

describe("buildDemotedThreadSections", () => {
  it("折りたたみに当たるスレがなければ、セクションを作らない", () => {
    expect(buildDemotedThreadSections([], getResult)).toEqual([]);
  });

  it("labelのない折りたたみは、従来どおり「折りたたんだスレ」の1つにまとめる", () => {
    const sections = buildDemotedThreadSections([collapsed("a", 0), collapsed("b", 1)], getResult);

    expect(namesOf(sections)).toEqual([
      { key: "demoted", label: "折りたたんだスレ（2）", names: ["a", "b"] },
    ]);
    expect(sections[0]).toMatchObject({ collapsible: true, defaultCollapsed: true });
  });

  it("labelを書いた折りたたみは、そのラベルを見出しにした独立したセクションにする", () => {
    const sections = buildDemotedThreadSections(
      [collapsed("a", 0, "定期スレ"), collapsed("b", 1, "宣伝"), collapsed("c", 0, "定期スレ")],
      getResult,
    );

    expect(namesOf(sections)).toEqual([
      { key: "demoted-rule-0", label: "定期スレ（2）", names: ["a", "c"] },
      { key: "demoted-rule-1", label: "宣伝（1）", names: ["b"] },
    ]);
    expect(sections.every((section) => section.defaultCollapsed === true)).toBe(true);
  });

  it("同じラベルでも別のルールなら、セクションを分ける", () => {
    const sections = buildDemotedThreadSections(
      [collapsed("a", 0, "注意"), collapsed("b", 2, "注意")],
      getResult,
    );

    expect(sections.map((section) => section.label)).toEqual(["注意（1）", "注意（1）"]);
  });

  it("ルールの位置が分からないときは、ラベルで束ねる", () => {
    const sections = buildDemotedThreadSections(
      [collapsed("a", undefined, "注意"), collapsed("b", undefined, "注意")],
      getResult,
    );

    expect(namesOf(sections)).toEqual([
      { key: "demoted-label-注意", label: "注意（2）", names: ["a", "b"] },
    ]);
  });

  it("labelのあるセクションを先に並べ、labelのないスレはその後ろにまとめる", () => {
    const sections = buildDemotedThreadSections(
      [collapsed("plain", 3), collapsed("labeled", 1, "注意")],
      getResult,
    );

    expect(sections.map((section) => section.key)).toEqual(["demoted-rule-1", "demoted"]);
  });

  it("labelの前後の空白は無視し、空のlabelは付けない扱いにする", () => {
    const sections = buildDemotedThreadSections(
      [collapsed("a", 0, "  "), collapsed("b", 1, " 注意 ")],
      getResult,
    );

    expect(namesOf(sections)).toEqual([
      { key: "demoted-rule-1", label: "注意（1）", names: ["b"] },
      { key: "demoted", label: "折りたたんだスレ（1）", names: ["a"] },
    ]);
  });
});
