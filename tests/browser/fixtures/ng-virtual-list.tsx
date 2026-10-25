import "src/view/browser/styles/index.css";

import { evaluateResponseRules, validateRuleDsl } from "@chlen/chlib";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { NgStatusProvider, useNgStatus } from "src/features/ng/browser/use-ng-status";
import { useThreadVirtualList } from "src/features/thread/browser/use-thread-virtual-list";
import { ResItem } from "src/features/thread/ui/ResItem";
import { VirtualResList } from "src/features/thread/ui/VirtualResList";
import { container, type IRes } from "src/service-container";
import { MiniWindowToggle } from "src/view/browser/components/MiniWindowControls";
import { TooltipProvider } from "src/view/browser/ui/Tooltip";

// 問題のルールをそのまま通す。保存領域や拡張機能APIは使わず、表示に必要な設定だけを注入する。
const ruleSource = String.raw`hide:
  when body regex "(imgur\\.com\\/.+?){15}"`;
const parsed = validateRuleDsl(ruleSource);
if (parsed.diagnostics.length > 0 || parsed.rules.length !== 1) {
  throw new Error(`NGルールを解析できません: ${JSON.stringify(parsed.diagnostics)}`);
}
container.config = {
  get: (key) => (key === "display_ng" ? "hard-ng" : null),
  ready: (callback) => callback(),
  getAll: () => ({ display_ng: "hard-ng" }),
  set: () => {
    throw new Error("この検証画面では設定を保存しません");
  },
};
container.message = { on: () => {}, off: () => {}, send: () => {} };

function imageMessage(count: number): string {
  // 架空の画像だけを使い、取得はテスト側がローカルで応答する。
  return Array.from(
    { length: count },
    (_, index) => `https://i.imgur.com/chlens-ng-e2e-${count}-${index}.png`,
  ).join("<br>");
}

const sourceResponses: IRes[] = Array.from({ length: 800 }, (_, index) => ({
  num: index + 1,
  name: "検証用の名無し",
  mail: "",
  date: "2026/10/25 12:00:00",
  message: index < 3 ? imageMessage([15, 16, 14][index]!) : `通常のレス ${index + 1}`,
}));

function evaluateResponses(): IRes[] {
  return sourceResponses.map((res) => {
    const matched = evaluateResponseRules(parsed.rules, {
      body: res.message,
      all: res.message,
      name: res.name,
      mail: res.mail,
      title: "NG表示の検証",
      url: "https://example.com/test/read.cgi/board/1000000000/",
    });
    return {
      ...res,
      ng: matched ? { type: matched.type, action: matched.rule.action } : undefined,
    };
  });
}

function Probe() {
  // 実画面も本文取得後に一覧をマウントする。先にスクロール容器のrefを確定させる。
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const scrollContainerRef = useMemo(() => ({ current: scrollContainer }), [scrollContainer]);
  const [revision, setRevision] = useState(0);
  const [responses, setResponses] = useState(evaluateResponses);
  const ngStatus = useNgStatus();
  const byNum = useMemo(() => new Map(responses.map((res) => [res.num, res])), [responses]);
  const list = useThreadVirtualList({
    responses,
    replayBoundary: -1,
    scrollContainerRef,
    stickToEnd: false,
    debugKey: "virtual-list:ng-browser-regression",
  });
  return (
    <>
      <pre data-testid="rule">{ruleSource}</pre>
      <output data-testid="ng-results">
        {responses
          .slice(0, 3)
          .map((res) => `${res.num}:${Boolean(res.ng)}`)
          .join(",")}
      </output>
      <section aria-label="NG切り替え">
        <MiniWindowToggle
          label="一時的にNGを解除"
          checked={ngStatus.isNgTemporarilyDisabled}
          onToggle={ngStatus.toggleNgTemporarilyDisabled}
        />
      </section>
      <button onClick={() => list.scrollToResponse(1, { highlight: false })}>先頭へ</button>
      <button onClick={() => list.scrollToResponse(400, { highlight: false })}>中央へ</button>
      <button
        onClick={() => {
          setResponses(evaluateResponses());
          setRevision((value) => value + 1);
        }}
      >
        NGを再判定
      </button>
      <output data-testid="revision">{revision}</output>
      <div
        ref={setScrollContainer}
        style={{ height: 480, overflowY: "auto", position: "relative" }}
      >
        {scrollContainer ? (
          <VirtualResList
            virtualizer={list.virtualizer}
            keys={list.keys}
            highlightKey={null}
            onHighlightApplied={() => {}}
            renderItem={(key) => {
              const res = typeof key === "number" ? byNum.get(key) : undefined;
              if (!res) return null;
              return (
                <ResItem
                  res={res}
                  idPos={0}
                  idCount={0}
                  repCount={0}
                  miniAa={false}
                  messageProtocol="https:"
                  isOwn={false}
                  isReplyToOwn={false}
                  isImageBlurred={false}
                  imageBlurRadius={0}
                  onIdClick={() => {}}
                  onRepClick={() => {}}
                  onUrlClick={() => false}
                  onUrlContextMenu={() => false}
                  onAnchorClick={() => {}}
                  onAnchorHover={() => {}}
                  onAnchorLeave={() => {}}
                  onContextMenu={() => {}}
                />
              );
            }}
          />
        ) : null}
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <NgStatusProvider>
      <Probe />
    </NgStatusProvider>
  </TooltipProvider>,
);
