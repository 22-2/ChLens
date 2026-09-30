import { useSyncExternalStore } from "react";
import { getPageViewStateKey, type Page } from "src/view/browser/types";

const cooldownUntilByScope = new Map<string, number>();
const manualRefreshScopes = new Set<string>();
const listenersByScope = new Map<string, Set<() => void>>();
const cooldownTimers = new Map<string, number>();

export const MANUAL_REFRESH_COOLDOWN_MS = 1500;

export function getManualRefreshScopeKey(tabId: string, page: Page): string {
  // 変更理由: 同じタブでも別スレ/別板の更新は独立させ、同じページの入口だけを揃える。
  return `${tabId}\u0000${getPageViewStateKey(page)}`;
}

function publishScope(scopeKey: string): void {
  listenersByScope.get(scopeKey)?.forEach((listener) => listener());
}

function subscribeToScope(scopeKey: string, listener: () => void): () => void {
  const listeners = listenersByScope.get(scopeKey) ?? new Set<() => void>();
  listeners.add(listener);
  listenersByScope.set(scopeKey, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByScope.delete(scopeKey);
  };
}

export function beginManualRefresh(scopeKey: string): void {
  const existingTimer = cooldownTimers.get(scopeKey);
  if (existingTimer !== undefined) window.clearTimeout(existingTimer);

  cooldownUntilByScope.set(scopeKey, Date.now() + MANUAL_REFRESH_COOLDOWN_MS);
  manualRefreshScopes.add(scopeKey);
  publishScope(scopeKey);

  // 変更理由: ボタンのdisabled表示とwheel受付を同じ期限で解除し、各hookの時計ずれを防ぐ。
  const timer = window.setTimeout(() => {
    cooldownTimers.delete(scopeKey);
    cooldownUntilByScope.delete(scopeKey);
    manualRefreshScopes.delete(scopeKey);
    publishScope(scopeKey);
  }, MANUAL_REFRESH_COOLDOWN_MS);
  cooldownTimers.set(scopeKey, timer);
}

export function runManualRefresh(scopeKey: string, refresh: () => void): boolean {
  if (isManualRefreshCoolingDown(scopeKey)) return false;
  beginManualRefresh(scopeKey);
  refresh();
  return true;
}

export function getManualRefreshCooldownRemainingMs(scopeKey: string): number {
  return Math.max(0, (cooldownUntilByScope.get(scopeKey) ?? 0) - Date.now());
}

export function isManualRefreshCoolingDown(scopeKey: string): boolean {
  return getManualRefreshCooldownRemainingMs(scopeKey) > 0;
}

export function useManualRefreshCooldown(scopeKey: string): boolean {
  return useSyncExternalStore(
    (listener) => subscribeToScope(scopeKey, listener),
    () => isManualRefreshCoolingDown(scopeKey),
    () => false,
  );
}

export function consumeManualRefresh(scopeKey: string): boolean {
  const wasManual = manualRefreshScopes.has(scopeKey);
  manualRefreshScopes.delete(scopeKey);
  return wasManual;
}
