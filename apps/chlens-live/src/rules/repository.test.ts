import { beforeEach, describe, expect, it } from "vite-plus/test";
import { LIVE_RULES_STORAGE_KEY, LocalStorageLiveRuleRepository } from "./repository";

describe("Live rule repository", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;

  beforeEach(() => {
    storage.clear();
  });

  it("uses a Live-only key and restores the saved DSL", () => {
    const repository = new LocalStorageLiveRuleRepository(LIVE_RULES_STORAGE_KEY, storage);
    const source = "hide body contains:\n  Live only";

    repository.save(source);

    expect(storage.getItem(LIVE_RULES_STORAGE_KEY)).toBe(source);
    expect(storage.getItem("config_ngwords")).toBeNull();
    expect(repository.load()).toBe(source);
  });

  it("allows a separate storage key for a future product-specific database adapter", () => {
    const first = new LocalStorageLiveRuleRepository("chlens-live.rules.first", storage);
    const second = new LocalStorageLiveRuleRepository("chlens-live.rules.second", storage);

    first.save("hide body contains:\n  first");
    second.save("hide body contains:\n  second");

    expect(first.load()).toContain("first");
    expect(second.load()).toContain("second");
  });
});
