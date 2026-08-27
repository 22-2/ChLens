import type { RuleRepository } from "@chlen/ch-lib";

/** Chlens本体の`config_`設定領域と衝突させないLive専用の保存キー。 */
export const LIVE_RULES_STORAGE_KEY = "chlens-live.rules.v1";

/**
 * Liveの初期版はWebViewのlocalStorageを使う。
 *
 * RuleRepositoryを介しておくことで、Phase 9でLive専用SQLiteへ移してもDSL parser／
 * evaluatorやMain／Overlayの利用側を変更せずに済む。
 */
export class LocalStorageLiveRuleRepository implements RuleRepository {
  constructor(
    private readonly storageKey = LIVE_RULES_STORAGE_KEY,
    private readonly storage?: Storage,
  ) {}

  load(): string | null {
    const storage = this.getStorage();
    if (!storage) return null;

    try {
      return storage.getItem(this.storageKey);
    } catch (error: unknown) {
      console.error(`[Chlens Live] rule read failed: ${this.storageKey}`, error);
      return null;
    }
  }

  save(source: string): void {
    const storage = this.getStorage();
    if (!storage) {
      const error = new Error("Live rule storage is unavailable");
      console.error(`[Chlens Live] rule write failed: ${this.storageKey}`, error);
      throw error;
    }

    try {
      storage.setItem(this.storageKey, source);
    } catch (error: unknown) {
      console.error(`[Chlens Live] rule write failed: ${this.storageKey}`, error);
      throw error;
    }
  }

  private getStorage(): Storage | null {
    return this.storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  }
}
