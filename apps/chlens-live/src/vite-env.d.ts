/// <reference types="vite/client" />

// Storybook のローカル dat fixture を URL として import するため、Vite query import を型付けする。
declare module "*.dat?url" {
  const url: string;
  export default url;
}
