import { useEffect, useState } from "react";

const cooldownUntilByTab = new Map<string, number>();
const manualRefreshTabs = new Set<string>();

export const MANUAL_REFRESH_COOLDOWN_MS = 3000;

export function beginManualRefresh(tabId: string): void {
  cooldownUntilByTab.set(tabId, Date.now() + MANUAL_REFRESH_COOLDOWN_MS);
  manualRefreshTabs.add(tabId);
}

export function runManualRefresh(tabId: string, refresh: () => void): void {
  if (isManualRefreshCoolingDown(tabId)) return;
  beginManualRefresh(tabId);
  refresh();
}

export function isManualRefreshCoolingDown(tabId: string): boolean {
  return (cooldownUntilByTab.get(tabId) ?? 0) > Date.now();
}

export function useManualRefreshCooldown(tabId: string): boolean {
  const [locked, setLocked] = useState(() => isManualRefreshCoolingDown(tabId));
  useEffect(() => {
    const until = cooldownUntilByTab.get(tabId) ?? 0;
    const remaining = until - Date.now();
    setLocked(remaining > 0);
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setLocked(false), remaining);
    return () => window.clearTimeout(timer);
  });
  return locked;
}

export function consumeManualRefresh(tabId: string): boolean {
  const wasManual = manualRefreshTabs.has(tabId);
  manualRefreshTabs.delete(tabId);
  return wasManual;
}
