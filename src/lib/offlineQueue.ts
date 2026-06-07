import { supabase } from "@/integrations/supabase/client";

export type PendingKind = "transaction" | "transfer";
export type PendingStatus = "pending" | "syncing" | "failed";

export interface PendingMovement {
  local_id: string;
  created_at: string;
  status: PendingStatus;
  kind: PendingKind;
  payload: Record<string, any>;
  error?: string;
}

const LS_KEY = "offlineQueue:v1";

const readAll = (): PendingMovement[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeAll = (items: PendingMovement[]) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
    notify();
  } catch {}
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => { try { l(); } catch {} });

export const subscribeOfflineQueue = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

const genId = () => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  } catch {}
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const addPendingMovement = (kind: PendingKind, payload: Record<string, any>): PendingMovement => {
  const items = readAll();
  const item: PendingMovement = {
    local_id: genId(),
    created_at: new Date().toISOString(),
    status: "pending",
    kind,
    payload,
  };
  items.push(item);
  writeAll(items);
  return item;
};

export const getPendingMovements = (): PendingMovement[] => readAll();

export const removePendingMovement = (local_id: string) => {
  writeAll(readAll().filter(i => i.local_id !== local_id));
};

export const markPendingFailed = (local_id: string, error: string) => {
  const items = readAll().map(i =>
    i.local_id === local_id ? { ...i, status: "failed" as PendingStatus, error } : i
  );
  writeAll(items);
};

const markStatus = (local_id: string, status: PendingStatus, error?: string) => {
  const items = readAll().map(i =>
    i.local_id === local_id ? { ...i, status, ...(error !== undefined ? { error } : { error: undefined }) } : i
  );
  writeAll(items);
};

// Detect transient network errors (offline / fetch fail). Validation/constraint errors should NOT be queued.
export const isNetworkError = (err: any): boolean => {
  if (!err) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("failed to fetch")) return true;
  if (msg.includes("networkerror")) return true;
  if (msg.includes("network error")) return true;
  if (msg.includes("load failed")) return true;
  if (msg.includes("fetch failed")) return true;
  if (err?.name === "TypeError" && msg.includes("fetch")) return true;
  // PostgREST/Supabase errors usually have a `code`. If a code is present, treat as non-network.
  if (err?.code) return false;
  return false;
};

let syncing = false;

export const syncPendingMovements = async (): Promise<{ synced: number; failed: number }> => {
  if (syncing) return { synced: 0, failed: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    const items = readAll().filter(i => i.status === "pending");
    for (const item of items) {
      markStatus(item.local_id, "syncing");
      const table = item.kind === "transaction" ? "transactions" : "transfers";
      try {
        const { error } = await supabase.from(table as any).insert(item.payload as any);
        if (error) {
          if (isNetworkError(error)) {
            markStatus(item.local_id, "pending");
          } else {
            markPendingFailed(item.local_id, error.message || "Sync failed");
            failed++;
          }
        } else {
          removePendingMovement(item.local_id);
          synced++;
        }
      } catch (e: any) {
        if (isNetworkError(e)) {
          markStatus(item.local_id, "pending");
        } else {
          markPendingFailed(item.local_id, e?.message || "Sync failed");
          failed++;
        }
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed };
};

// Cross-tab sync via storage event
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) notify();
  });
}
