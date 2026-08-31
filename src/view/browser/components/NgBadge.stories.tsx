import type { INGResult } from "src/service-container/interfaces";
import { NgBadge } from "./NgBadge";
import "src/view/browser/styles/pages/thread/ThreadResponse.css";

export default { title: "ChLens/NgBadge" };

const matchedRule: INGResult = {
  type: "word",
  action: "hide",
  ruleDescription: "本文に『広告』を含む",
};

export function Matched() {
  return <NgBadge result={matchedRule} />;
}

export function Disabled() {
  return <NgBadge result={{ ...matchedRule, disabled: true }} />;
}
