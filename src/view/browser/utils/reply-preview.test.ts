import type { IRes } from "src/service-container";
import { buildReplyPreview } from "src/view/browser/utils/reply-preview";
import { describe, expect, it } from "vite-plus/test";

const makeRes = (num: number, message: string, extra: Partial<IRes> = {}): IRes =>
  ({ num, name: "名無しさん", message, ...extra }) as IRes;

describe("返信先プレビューの生成", () => {
  it("最初のアンカーの返信先を、アンカーを除いた本文で要約する", () => {
    const resMap = new Map([[1, makeRes(1, "在庫確認しようと思って<br>カートに入れた")]]);
    const preview = buildReplyPreview(makeRes(2, "&gt;&gt;1 それな"), resMap);
    expect(preview).toMatchObject({ num: 1, hasImage: false });
    expect(preview?.text).toBe("在庫確認しようと思って カートに入れた");
  });

  it("返信先に画像URLがあるとき画像ありとして扱う", () => {
    const resMap = new Map([[1, makeRes(1, "https://example.com/a.jpg")]]);
    expect(buildReplyPreview(makeRes(2, "&gt;&gt;1"), resMap)?.hasImage).toBe(true);
  });

  it("アンカーがない、返信先が存在しない、NG対象のときは作らない", () => {
    const resMap = new Map([[1, makeRes(1, "本文", { class: ["ng"] })]]);
    expect(buildReplyPreview(makeRes(2, "アンカーなし"), resMap)).toBeNull();
    expect(buildReplyPreview(makeRes(3, "&gt;&gt;9"), resMap)).toBeNull();
    expect(buildReplyPreview(makeRes(2, "&gt;&gt;1"), resMap)).toBeNull();
  });
});
