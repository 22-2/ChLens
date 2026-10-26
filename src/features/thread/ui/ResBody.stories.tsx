import { ResBody } from "./ResBody";

export default { title: "ChLens/スレッド/ResBody" };

const handlers = {
  onUrlClick: () => true,
  onUrlContextMenu: () => {},
  onIdLinkClick: () => {},
  onAnchorClick: () => {},
  onAnchorHover: () => {},
  onAnchorLeave: () => {},
};

export function LinksAndAnchors() {
  return (
    <div className="storybook-demo storybook-demo--narrow">
      <ResBody
        messageHtml={
          'リンク <a href="https://example.com/sample">サンプル</a> と <a class="anchor">&gt;&gt;2</a> を含む本文です。'
        }
        anchorPreviewDepth={0}
        {...handlers}
      />
    </div>
  );
}

export function LongText() {
  return (
    <div className="storybook-demo storybook-demo--narrow">
      <ResBody
        messageHtml={
          "長い本文の折り返しを確認するサンプルです。読む人が内容を追いやすいよう、短い段落を重ねています。レスの文章には説明、補足、引用が含まれることがあり、テーマを切り替えても読みやすさが保たれる必要があります。\n\n二つ目の段落では、レス本文の幅や行間、リンクの色を確認できます。"
        }
        anchorPreviewDepth={0}
        {...handlers}
      />
    </div>
  );
}

export function SearchHighlights() {
  return (
    <div className="storybook-demo storybook-demo--narrow">
      <ResBody
        messageHtml="検索語の一致とページ内検索の現在位置を同時に確認します。"
        searchQuery="検索"
        findQuery="現在位置"
        findActiveOccurrence={0}
        anchorPreviewDepth={0}
        {...handlers}
      />
    </div>
  );
}

export function AnchorTargets() {
  return (
    <div className="storybook-demo storybook-demo--narrow">
      <ResBody
        messageHtml={
          '有効な参照 <a class="anchor">&gt;&gt;2</a> と欠損した参照 <a class="anchor">&gt;&gt;404</a>。'
        }
        anchorPreviewDepth={0}
        ngResNums={new Set([2])}
        resMap={new Map([[2, {}]])}
        {...handlers}
      />
    </div>
  );
}
