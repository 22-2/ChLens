import Config from "src/app/Config";

// 変更理由: Config はアプリ合成ルートとサービスコンテナの両方から使うため、
// app.ts に置くと setupContainer から逆向きの依存が生まれる。
export const configInstance = new Config();

export const config = new Proxy({} as Config, {
  get(_target, prop) {
    const actualConfig = configInstance;
    if (!actualConfig) {
      console.error("config is not initialized");
      return undefined;
    }
    return actualConfig[prop as keyof Config];
  },
});
