/** Viteが生成したワーカーを使い、既存のMonaco環境設定は保持する。 */
export function configureDslMonacoWorker(EditorWorker: new () => Worker): void {
  const globalScope = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker?: () => Worker; [key: string]: unknown };
  };
  globalScope.MonacoEnvironment = {
    ...globalScope.MonacoEnvironment,
    getWorker: () => new EditorWorker(),
  };
}
