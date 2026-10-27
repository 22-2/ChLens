import { registerArchiveReplayCommands } from "src/features/archive-replay/browser/register-archive-replay-commands";
import { registerAutoRefreshCommands } from "src/features/auto-refresh/browser/register-auto-refresh-commands";
import { registerBookmarkCommands } from "src/features/bookmark/browser/register-bookmark-commands";
import { registerFilterCommands } from "src/features/filter/browser/register-filter-commands";
import { registerMediaCommands } from "src/features/media/browser/register-media-commands";
import { registerNextThreadCommands } from "src/features/next-thread/browser/register-next-thread-commands";
import { registerCoreCommands } from "src/view/browser/commands/browser-commands";
import type { BrowserCommandDefinition } from "src/view/browser/commands/command-definition";
import { filterAndSortBrowserCommands } from "src/view/browser/commands/command-search";
import { CommandRegistry } from "src/view/browser/extension/command-registry";
import { createExtensionOwner } from "src/view/browser/extension/extension-api";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("webextension-polyfill", () => ({ default: {} }));

describe("機能コマンドの登録順", () => {
  it("フィルターの定義を移しても前後のコマンドの順序を保ち、旧履歴は無視する", () => {
    const registry = new CommandRegistry<BrowserCommandDefinition>();
    const core = createExtensionOwner("core", registry);
    const filter = createExtensionOwner("filter", registry);
    const media = createExtensionOwner("media", registry);
    const bookmark = createExtensionOwner("bookmark", registry);
    const auto = createExtensionOwner("auto-refresh", registry);
    const next = createExtensionOwner("next-thread", registry);
    const archive = createExtensionOwner("archive-replay", registry);
    try {
      registerCoreCommands(core.api);
      registerFilterCommands(filter.api);
      registerMediaCommands(media.api);
      registerBookmarkCommands(bookmark.api);
      registerAutoRefreshCommands(auto.api);
      registerNextThreadCommands(next.api);
      registerArchiveReplayCommands(archive.api);
      const commands = registry.getSnapshot();
      const ids = commands.map((command) => command.id);
      expect(
        ids.slice(ids.indexOf("next-thread.search"), ids.indexOf("page.toggle-write-panel") + 1),
      ).toEqual([
        "next-thread.search",
        "next-thread.search-related",
        "filter.toggle",
        "page.toggle-write-panel",
      ]);
      expect(
        ids.slice(
          ids.indexOf("media.delete-thread-imgur-images"),
          ids.indexOf("layout.toggle-zen-mode"),
        ),
      ).toEqual([
        "media.delete-thread-imgur-images",
        "media.delete-all-imgur-images",
        "filter.toggle-popular",
        "filter.toggle-image",
        "filter.toggle-video",
        "filter.toggle-link",
        "auto-refresh.toggle",
        "next-thread.toggle-auto",
      ]);
      const shown = commands.map((command) => ({
        ...command,
        label: typeof command.label === "string" ? command.label : "動的",
        englishLabel: typeof command.englishLabel === "string" ? command.englishLabel : "Dynamic",
        keywords: command.keywords ?? [],
        enabled: true,
      }));
      const originalOrder = shown.map((command) => command.id);
      expect(
        filterAndSortBrowserCommands(shown, "", ["削除済みのID"]).map((command) => command.id),
      ).toEqual(originalOrder);
      filter.dispose();
      expect(registry.getSnapshot().some((command) => command.id.startsWith("filter."))).toBe(
        false,
      );
      expect(
        registry.getSnapshot().some((command) => command.id === "media.delete-thread-imgur-images"),
      ).toBe(true);
    } finally {
      archive.dispose();
      next.dispose();
      auto.dispose();
      bookmark.dispose();
      media.dispose();
      filter.dispose();
      core.dispose();
    }
  });
});
