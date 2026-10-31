import { useCallback, useState } from "react";

/** レスごとの画像の展開状態と表示幅を、スレッドが変わるまで保持する。 */
export function useThreadImageExpansion(threadUrl: string) {
  // 仮想化でレスが外れても、展開状態はスレ表示の間保持する。
  const [imageExpansion, setImageExpansion] = useState<{
    threadUrl: string;
    responses: ReadonlyMap<number, ReadonlySet<string>>;
  }>(() => ({ threadUrl: threadUrl, responses: new Map() }));
  const expandedImages = imageExpansion.threadUrl === threadUrl ? imageExpansion.responses : null;
  // レスの再描画や折りたたみを挟んでも、画像ごとの調整幅を保持する。
  const [imageWidths, setImageWidths] = useState<{
    threadUrl: string;
    responses: ReadonlyMap<number, ReadonlyMap<string, number>>;
  }>(() => ({ threadUrl: threadUrl, responses: new Map() }));
  const resizeImage = useCallback(
    (resNum: number, url: string, width: number) => {
      setImageWidths((current) => {
        const responses = new Map(current.threadUrl === threadUrl ? current.responses : []);
        const widths = new Map(responses.get(resNum));
        widths.set(url, width);
        responses.set(resNum, widths);
        return { threadUrl: threadUrl, responses };
      });
    },
    [threadUrl],
  );
  const toggleImage = useCallback(
    (resNum: number, url: string) => {
      setImageExpansion((current) => {
        // 同じタブで別スレに移ったとき、前のスレのレス番号を引き継がない。
        const next = new Map(current.threadUrl === threadUrl ? current.responses : []);
        const urls = new Set(next.get(resNum));
        if (urls.has(url)) urls.delete(url);
        else urls.add(url);
        if (urls.size) next.set(resNum, urls);
        else next.delete(resNum);
        return { threadUrl: threadUrl, responses: next };
      });
    },
    [threadUrl],
  );
  return { expandedImages, imageWidths, resizeImage, toggleImage };
}
