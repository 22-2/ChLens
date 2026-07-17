import JSZip from "jszip";
import { container } from "src/service-container/index";
import * as History from "src/core/History";
import * as WriteHistory from "src/core/WriteHistory";

const ARCHIVE_SCHEMA_VERSION = 1;

const SETTINGS_JSON_PATH = "settings.json";
const HISTORY_JSON_PATH = "history.json";
const WRITE_HISTORY_JSON_PATH = "write-history.json";
const MANIFEST_JSON_PATH = "manifest.json";

interface ExportManifest {
  schemaVersion: number;
  app: string;
  exportedAt: string;
  includedFiles: string[];
}

interface SettingsExportPayload {
  schemaVersion: number;
  exportedAt: string;
  settings: Record<string, string | number>;
}

interface HistoryExportRecord {
  url: string;
  title: string;
  date: number;
  boardTitle: string;
}

interface WriteHistoryExportRecord {
  url: string;
  res: number;
  title: string;
  name: string;
  mail: string;
  input_name: string;
  input_mail: string;
  message: string;
  date: number;
}

interface HistoryExportPayload {
  schemaVersion: number;
  exportedAt: string;
  items: HistoryExportRecord[];
}

interface WriteHistoryExportPayload {
  schemaVersion: number;
  exportedAt: string;
  items: WriteHistoryExportRecord[];
}

type SettingsImportPayload =
  | SettingsExportPayload
  | {
      schemaVersion?: number;
      exportedAt?: string;
      settings?: Record<string, unknown>;
      [key: string]: unknown;
    };

interface ExportArchiveOptions {
  includeHistory: boolean;
  includeWriteHistory: boolean;
}

export interface ImportArchiveResult {
  importedSettingsCount: number;
  importedHistoryCount: number;
  importedWriteHistoryCount: number;
}

function toJsonString(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function normalizeConfigEntries(
  source: Record<string, unknown>,
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = rawKey.startsWith("config_") ? rawKey.slice(7) : rawKey;
    if (typeof rawValue === "string") {
      normalized[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      normalized[key] = String(rawValue);
    }
  }

  return normalized;
}

function toHistoryExportRecord(value: unknown): HistoryExportRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.url !== "string" ||
    typeof record.title !== "string" ||
    typeof record.date !== "number" ||
    !Number.isFinite(record.date)
  ) {
    return null;
  }

  return {
    url: record.url,
    title: record.title,
    date: record.date,
    boardTitle: typeof record.boardTitle === "string" ? record.boardTitle : "",
  };
}

function toWriteHistoryExportRecord(
  value: unknown,
): WriteHistoryExportRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.url !== "string" ||
    typeof record.res !== "number" ||
    !Number.isFinite(record.res) ||
    typeof record.title !== "string" ||
    typeof record.name !== "string" ||
    typeof record.mail !== "string" ||
    typeof record.message !== "string" ||
    typeof record.date !== "number" ||
    !Number.isFinite(record.date)
  ) {
    return null;
  }

  return {
    url: record.url,
    res: record.res,
    title: record.title,
    name: record.name,
    mail: record.mail,
    input_name:
      typeof record.input_name === "string" ? record.input_name : record.name,
    input_mail:
      typeof record.input_mail === "string" ? record.input_mail : record.mail,
    message: record.message,
    date: record.date,
  };
}

async function readJsonEntry<T>(zip: JSZip, path: string): Promise<T | null> {
  const file = zip.file(path);
  if (!file) {
    return null;
  }

  const text = await file.async("string");
  return JSON.parse(text) as T;
}

export async function exportDataArchive(
  options: ExportArchiveOptions,
): Promise<Blob> {
  const zip = new JSZip();
  const exportedAt = new Date().toISOString();
  const includedFiles: string[] = [SETTINGS_JSON_PATH];

  const settingsPayload: SettingsExportPayload = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    exportedAt,
    settings: container.config.getAll(),
  };
  zip.file(SETTINGS_JSON_PATH, toJsonString(settingsPayload));

  if (options.includeHistory) {
    const rows = await History.getAll();
    const normalizedRows = rows
      .map((row) => toHistoryExportRecord(row))
      .filter((row): row is HistoryExportRecord => row != null);
    const payload: HistoryExportPayload = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      exportedAt,
      items: normalizedRows,
    };
    zip.file(HISTORY_JSON_PATH, toJsonString(payload));
    includedFiles.push(HISTORY_JSON_PATH);
  }

  if (options.includeWriteHistory) {
    const rows = await WriteHistory.getAll();
    const normalizedRows = rows
      .map((row) => toWriteHistoryExportRecord(row))
      .filter((row): row is WriteHistoryExportRecord => row != null);

    const payload: WriteHistoryExportPayload = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      exportedAt,
      items: normalizedRows,
    };
    zip.file(WRITE_HISTORY_JSON_PATH, toJsonString(payload));
    includedFiles.push(WRITE_HISTORY_JSON_PATH);
  }

  const manifest: ExportManifest = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    app: "chlens",
    exportedAt,
    includedFiles,
  };
  zip.file(MANIFEST_JSON_PATH, toJsonString(manifest));

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export async function importDataArchive(
  archiveFile: File,
): Promise<ImportArchiveResult> {
  const zip = await JSZip.loadAsync(archiveFile);

  const settingsPayload = await readJsonEntry<SettingsImportPayload>(
    zip,
    SETTINGS_JSON_PATH,
  );
  const settingsSource =
    settingsPayload && "settings" in settingsPayload
      ? settingsPayload.settings
      : settingsPayload;
  const normalizedSettings =
    settingsSource && typeof settingsSource === "object"
      ? normalizeConfigEntries(settingsSource as Record<string, unknown>)
      : {};

  // 変更理由: zip一発で復元できるUXを優先し、既存設定は差分ではなく上書きで同期する。
  await Promise.all(
    Object.entries(normalizedSettings).map(([key, value]) =>
      container.config.set(key, value),
    ),
  );

  const historyPayload = await readJsonEntry<
    HistoryExportPayload | { items?: unknown[] }
  >(zip, HISTORY_JSON_PATH);

  const historyItems = Array.isArray(historyPayload?.items)
    ? historyPayload.items
        .map((row) => toHistoryExportRecord(row))
        .filter((row): row is HistoryExportRecord => row != null)
    : [];

  if (historyItems.length > 0) {
    // 変更理由: エクスポート時点の履歴を再現するため、既存履歴を先に全消去する。
    await History.clear();
    for (const row of historyItems) {
      await History.add(row.url, row.title, row.date, row.boardTitle);
    }
  }

  const writeHistoryPayload = await readJsonEntry<
    WriteHistoryExportPayload | { items?: unknown[] }
  >(zip, WRITE_HISTORY_JSON_PATH);

  const writeHistoryItems = Array.isArray(writeHistoryPayload?.items)
    ? writeHistoryPayload.items
        .map((row) => toWriteHistoryExportRecord(row))
        .filter((row): row is WriteHistoryExportRecord => row != null)
    : [];

  if (writeHistoryItems.length > 0) {
    // 変更理由: 既存データへ単純追加すると重複投稿履歴が増えるため、復元時は完全置換にする。
    await WriteHistory.clear();
    for (const row of writeHistoryItems) {
      await WriteHistory.add({
        url: row.url,
        res: row.res,
        title: row.title,
        name: row.name,
        mail: row.mail,
        inputName: row.input_name,
        inputMail: row.input_mail,
        message: row.message,
        date: row.date,
      });
    }
  }

  return {
    importedSettingsCount: Object.keys(normalizedSettings).length,
    importedHistoryCount: historyItems.length,
    importedWriteHistoryCount: writeHistoryItems.length,
  };
}

export function buildDataExportFilename(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `chlens-data-${timestamp}.zip`;
}
