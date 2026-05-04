type TauriRepositoriesModule = typeof import("src/app/platform/tauri/drizzle/repositories");

import { isTauriRuntime as detectTauriRuntime } from "src/app/platform/runtime";

let repositoriesPromise: Promise<TauriRepositoriesModule> | null = null;

export function isTauriRuntime(): boolean {
  return detectTauriRuntime();
}

export async function getTauriRepositories(): Promise<TauriRepositoriesModule> {
  if (repositoriesPromise == null) {
    repositoriesPromise = import("src/app/platform/tauri/drizzle/repositories");
  }
  return repositoriesPromise;
}
