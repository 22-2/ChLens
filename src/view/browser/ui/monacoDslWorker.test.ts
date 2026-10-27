import { configureDslMonacoWorker } from "src/view/browser/ui/monacoDslWorker";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => vi.unstubAllGlobals());

it("既存の環境設定を保ち、生成されたワーカーを起動する", () => {
  const worker = {} as Worker;
  const WorkerConstructor = vi.fn(function () {
    return worker;
  });
  vi.stubGlobal("MonacoEnvironment", { customSetting: true });
  configureDslMonacoWorker(WorkerConstructor);
  const environment = (
    globalThis as typeof globalThis & {
      MonacoEnvironment: { customSetting: boolean; getWorker: () => Worker };
    }
  ).MonacoEnvironment;
  expect(environment.customSetting).toBe(true);
  expect(environment.getWorker()).toBe(worker);
  expect(WorkerConstructor).toHaveBeenCalledOnce();
});
