/**
 * DSL sourceの保存先だけを製品ごとに差し替えるためのport。
 *
 * 読み込みは既存Chlensの同期的なNG判定を維持できるよう同期契約にし、保存は
 * localStorageとTauri DBのどちらにも対応できるよう同期／非同期の両方を許可する。
 */
export interface RuleRepository {
  load(): string | null;
  save(source: string): void | Promise<void>;
}

/** テストとLiveの初期compositionで使える、process-local repository。 */
export class MemoryRuleRepository implements RuleRepository {
  private source: string | null;

  constructor(initialSource: string | null = null) {
    this.source = initialSource;
  }

  load(): string | null {
    return this.source;
  }

  save(source: string): void {
    this.source = source;
  }
}
