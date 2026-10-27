// package exports の対象外にあるMonaco ESM内部モジュールをVite alias経由で使う。
declare module "monaco-editor/esm/vs/editor/editor.api.js" {
  export * from "monaco-editor";
}

declare module "monaco-editor/esm/vs/editor/*";

declare module "monaco-editor/esm/vs/editor/editor.worker?worker" {
  const EditorWorkerFactory: new () => Worker;
  export default EditorWorkerFactory;
}
