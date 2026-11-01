import type { INGResult } from "src/service-container";
import type { DataTableSection } from "src/view/browser/components/SimpleDataTable";

interface LabeledGroup<TRow> {
  order: number;
  label: string;
  rows: TRow[];
}

/**
 * 折りたたんだスレを、スレ一覧のセクションに分ける。
 *
 * labelを書いた折りたたみルールは、そのラベルを見出しにした独立したセクションにする（ルールごとに分ける）。
 * labelのないルールのスレは、従来どおり「折りたたんだスレ」の1つにまとめる。
 * どのセクションも初期状態は折りたたんでおく。
 */
export function buildDemotedThreadSections<TRow>(
  rows: readonly TRow[],
  getResult: (row: TRow) => INGResult | null | undefined,
): DataTableSection<TRow>[] {
  const labeledGroups = new Map<string, LabeledGroup<TRow>>();
  const unlabeledRows: TRow[] = [];
  for (const row of rows) {
    const result = getResult(row);
    const label = result?.params?.label?.trim();
    if (result == null || !label) {
      unlabeledRows.push(row);
      continue;
    }
    // 同じlabelでも別のルールなら独立させる。ルールの位置が分からないときだけlabelで束ねる。
    const key = result.ruleIndex != null ? `rule-${result.ruleIndex}` : `label-${label}`;
    const existing = labeledGroups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      labeledGroups.set(key, {
        order: result.ruleIndex ?? Number.MAX_SAFE_INTEGER,
        label,
        rows: [row],
      });
    }
  }

  const labeledSections = Array.from(labeledGroups.entries())
    .sort(([, left], [, right]) => left.order - right.order)
    .map(([key, group]) => ({
      key: `demoted-${key}`,
      label: `${group.label}（${group.rows.length}）`,
      rows: group.rows,
      collapsible: true,
      defaultCollapsed: true,
    }));
  const unlabeledSections =
    unlabeledRows.length > 0
      ? [
          {
            key: "demoted",
            label: `折りたたんだスレ（${unlabeledRows.length}）`,
            rows: unlabeledRows,
            collapsible: true,
            defaultCollapsed: true,
          },
        ]
      : [];
  return [...labeledSections, ...unlabeledSections];
}
