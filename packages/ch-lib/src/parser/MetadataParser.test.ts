// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { MetadataParser } from "./MetadataParser";

describe("MetadataParser", () => {
  it("日付欄からIDの値だけを取り出し、日付は入力のまま保持する", () => {
    const date = "2026/08/27(木) 12:00:00.00 ID:abcd1234";

    expect(MetadataParser.parse("名無しさん", date)).toEqual({ date, id: "abcd1234" });
  });

  it("発信元の表示からIPアドレスを取り出す", () => {
    expect(MetadataParser.parse("", "2026/08/27(木) 12:00:00.00 発信元:192.0.2.1").id).toBe(
      "192.0.2.1",
    );
  });

  it("ID:???や末尾の●はIDとして扱わない・取り除く", () => {
    expect(MetadataParser.parse("", "2026/08/27(木) 12:00:00.00 ID:???").id).toBeUndefined();
    expect(MetadataParser.parse("", "2026/08/27(木) 12:00:00.00 ID:abc●").id).toBe("abc");
  });

  it("名前欄からSlipとトリップを取り出す", () => {
    const result = MetadataParser.parse("名前</b> ◆trip123 <b>", "2026/08/27(木) 12:00:00.00");
    expect(result.trip).toBe("◆trip123");

    const withSlip = MetadataParser.parse("名前</b>(ワッチョイ abcd-ef12)<b>", "");
    expect(withSlip.slip).toBe("ワッチョイ abcd-ef12");
  });

  it("手掛かりが無ければ日付だけを返す", () => {
    expect(MetadataParser.parse("名無しさん", "2026/08/27")).toEqual({ date: "2026/08/27" });
  });
});
