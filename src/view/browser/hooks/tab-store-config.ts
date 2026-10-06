import { getStore2String } from "src/app/Store2Storage";

// タブストアが参照する設定値の読み取り。ストレージ未初期化などで例外になっても既定値へ倒せるよう null を返す。
const CONFIG_KEY_PREFIX = "config_";

export function readConfigValue(key: string): string | null {
  try {
    return getStore2String(`${CONFIG_KEY_PREFIX}${key}`);
  } catch (error) {
    // 読み取れない場合は未設定として既定値へ倒すが、原因調査のためログは残す。
    console.warn("[tab-store] 設定値を読み取れませんでした", { key, error });
    return null;
  }
}
