import { describe, expect, it } from "vite-plus/test";
import { MemoryRuleRepository } from "./repository";

describe("rule repository port", () => {
  it("stores source without knowing the product storage", () => {
    const repository = new MemoryRuleRepository();

    expect(repository.load()).toBeNull();
    repository.save("hide body contains:\n  shared");
    expect(repository.load()).toBe("hide body contains:\n  shared");
  });
});
