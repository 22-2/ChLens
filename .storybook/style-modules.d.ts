// 変更理由: Storybook設定はアプリ本体の型検査対象外でCSS宣言を自動参照しないため、
// Viteが処理する副作用importをStorybook側でも型検査できるようにする。
declare module "*.css";
