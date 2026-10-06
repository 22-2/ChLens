import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BrowserCommandContext,
  type ResolvedBrowserCommand,
} from "src/view/browser/commands/browser-commands";
import { runBrowserCommand } from "src/view/browser/commands/command-executor";
import {
  addRecentCommandId,
  normalizeRecentCommandIds,
} from "src/view/browser/commands/command-history";
import {
  loadRecentCommandIds,
  saveRecentCommandIds,
} from "src/view/browser/commands/command-palette-history";

interface UseBrowserCommandRunnerOptions {
  context: BrowserCommandContext;
  /** コマンド実行直前に呼ぶ。パレットを閉じる等、画面側の後始末を渡す。 */
  onBeforeExecute: () => void;
}

/**
 * コマンドの実行状態と、最近使ったコマンドの履歴を管理する。
 *
 * 変更理由: 実行中ID・履歴の永続化・実行のラップは画面の描画と独立しているため、
 * NavigationBar から切り出す。実行時の最新contextを参照するためrefで保持する。
 */
export function useBrowserCommandRunner({
  context,
  onBeforeExecute,
}: UseBrowserCommandRunnerOptions) {
  const [runningCommandIds, setRunningCommandIds] = useState<Set<string>>(() => new Set());
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const recentCommandIdsRef = useRef(recentCommandIds);
  recentCommandIdsRef.current = recentCommandIds;
  const contextRef = useRef(context);
  contextRef.current = context;
  const onBeforeExecuteRef = useRef(onBeforeExecute);
  onBeforeExecuteRef.current = onBeforeExecute;

  useEffect(() => {
    let cancelled = false;
    void loadRecentCommandIds().then((loaded) => {
      if (cancelled) return;
      // 保存済み履歴の読み込み前にコマンドを実行しても、その実行を古い履歴で
      // 上書きしないよう、現在のメモリ上の履歴を優先して結合する。
      const merged = normalizeRecentCommandIds([...recentCommandIdsRef.current, ...loaded]);
      recentCommandIdsRef.current = merged;
      setRecentCommandIds(merged);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const recordCommand = useCallback((commandId: string) => {
    const next = addRecentCommandId(recentCommandIdsRef.current, commandId);
    recentCommandIdsRef.current = next;
    setRecentCommandIds(next);
    void saveRecentCommandIds(next);
  }, []);

  const executeCommand = useCallback(
    async (command: ResolvedBrowserCommand) => {
      await runBrowserCommand({
        commandId: command.id,
        context: contextRef.current,
        onBeforeExecute: () => onBeforeExecuteRef.current(),
        onCommandRecorded: recordCommand,
        onRunningChange: (commandId, running) => {
          setRunningCommandIds((current) => {
            if (running) {
              if (current.has(commandId)) return current;
              return new Set(current).add(commandId);
            }

            if (!current.has(commandId)) return current;
            const next = new Set(current);
            next.delete(commandId);
            return next;
          });
        },
      });
    },
    [recordCommand],
  );

  return { runningCommandIds, recentCommandIds, executeCommand };
}
