import { registerFilterCommands } from "src/features/filter/browser/register-filter-commands";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";

/** 組み立て層を通らないテストでも、アプリと同じフィルターを登録する。 */
export function registerTestFilterCommands(api: ExtensionApi): void {
  registerFilterCommands(api);
}
