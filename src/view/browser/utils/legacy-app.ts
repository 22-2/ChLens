interface LegacyBookmarkService {
  getAll?: () => unknown;
  getAllThreads?: () => unknown;
  getAllBoards?: () => unknown;
  promiseFirstScan?: Promise<boolean>;
  import?: (entry: unknown) => Promise<boolean> | boolean;
}

interface LegacyCallbacksLike {
  add?: (callback: () => void) => void;
  wasCalled?: boolean;
}

interface LegacyBookmarkEntryList {
  setRootNodeId?: (rootNodeId: string) => Promise<boolean> | boolean;
  needReconfigureRootNodeId?: LegacyCallbacksLike;
}

interface LegacyConfigService {
  get?: (key: string) => string | null;
  set?: (key: string, value: string) => Promise<void> | void;
}

interface LegacyHistoryService {
  get?: (offset?: number, count?: number) => unknown;
}

interface LegacyReadStateService {
  getAll?: () => unknown;
}

interface LegacyWriteHistoryService {
  get?: (offset?: number, count?: number) => unknown;
  add?: (item: {
    date: number;
    mail: string;
    message: string;
    name: string;
    res: number;
    title: string;
    url: string;
  }) => Promise<void> | void;
  remove?: (url: string, res: number) => Promise<void> | void;
}

interface LegacyAppShape {
  bookmark?: LegacyBookmarkService;
  bookmarkEntryList?: LegacyBookmarkEntryList;
  config?: LegacyConfigService;
  History?: LegacyHistoryService;
  ReadState?: LegacyReadStateService;
  WriteHistory?: LegacyWriteHistoryService;
}

function getLegacyApp(): LegacyAppShape | undefined {
  return (window as Window & { app?: LegacyAppShape }).app;
}

export function getLegacyBookmarkService(): LegacyBookmarkService | undefined {
  return getLegacyApp()?.bookmark;
}

export function getLegacyBookmarkEntryList(): LegacyBookmarkEntryList | undefined {
  return getLegacyApp()?.bookmarkEntryList;
}

export function getLegacyConfigService(): LegacyConfigService | undefined {
  return getLegacyApp()?.config;
}

export async function waitForLegacyBookmarkReady(): Promise<void> {
  try {
    // 変更理由: BrowserBookmarkEntryList は初回 scan 完了前だと空配列を返しうるため、
    // new-ui でも既存ブックマークの初期表示を取りこぼさないよう待機する。
    await getLegacyBookmarkService()?.promiseFirstScan;
  } catch {
    // 初回同期が失敗しても、呼び出し側は利用可能なデータで表示を継続する。
  }
}

export function getLegacyHistoryService(): LegacyHistoryService | undefined {
  return getLegacyApp()?.History;
}

export function getLegacyReadStateService(): LegacyReadStateService | undefined {
  return getLegacyApp()?.ReadState;
}

export function getLegacyWriteHistoryService(): LegacyWriteHistoryService | undefined {
  return getLegacyApp()?.WriteHistory;
}
