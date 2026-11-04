// 旧セッションに窓IDがないペインも、この本窓に所属する。
export const MAIN_WINDOW_ID = "main";

export interface WorkspaceWindow {
  id: string;
  kind: "main" | "aux";
  activePaneId: string;
  bounds?: { left: number; top: number; width: number; height: number };
}
