import type { INGResult } from "src/service-container/interfaces";
import { useState } from "react";
import { NgResponsePlaceholder } from "./NgResponsePlaceholder";

export default { title: "ChLens/NgResponsePlaceholder" };

const result: INGResult = {
  type: "word",
  action: "hide",
  ruleDescription: "本文に『広告』を含む",
};

export function Default() {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return <div className="res__ng-reveal">表示状態（Story上の確認用）</div>;
  }

  return (
    <NgResponsePlaceholder
      responseNumber={123}
      result={result}
      responseStateClassName="res--state-ng"
      onReveal={() => setRevealed(true)}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
