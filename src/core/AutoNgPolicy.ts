import { container } from "src/service-container/index";

export const AUTO_NG_CONFIG_KEYS = {
  chain: "chain_ng",
  chainId: "chain_ng_id",
  chainSlip: "chain_ng_slip",
  missingId: "nothing_id_ng",
  missingSlip: "nothing_slip_ng",
  identityJudgment: "how_to_judgment_id",
  repeatMessageCount: "repeat_message_ng_count",
} as const;

export type AutoNgToggle = "chain" | "chainId" | "chainSlip" | "missingId" | "missingSlip";
export type IdentityJudgment = "first_res" | "exists_once" | "disabled";

/** 自動NGの設定キーを判定処理から隠し、設定名の追加・変更を一箇所へ閉じ込める。 */
export function isAutoNgEnabled(policy: AutoNgToggle): boolean {
  return Boolean(container.config.get(AUTO_NG_CONFIG_KEYS[policy]));
}

export function getIdentityJudgment(): IdentityJudgment {
  const value = container.config.get(AUTO_NG_CONFIG_KEYS.identityJudgment);
  return value === "first_res" || value === "exists_once" ? value : "disabled";
}

export function getRepeatMessageThreshold(): number {
  const value = Number.parseInt(
    container.config.get(AUTO_NG_CONFIG_KEYS.repeatMessageCount) ?? "",
    10,
  );
  return Number.isFinite(value) && value > 1 ? value : 0;
}
