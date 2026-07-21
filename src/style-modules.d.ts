// Vite が解決するスタイルの副作用 import を TypeScript に認識させる。
// global.d.ts は外部モジュールなので、ワイルドカード宣言はスクリプト形式の別ファイルに置く。
declare module "*.css";
declare module "*.scss";
