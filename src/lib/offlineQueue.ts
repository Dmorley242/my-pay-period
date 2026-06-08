import { supabase } from "@/integrations/supabase/client";
import { isLikelyNetworkOrTimeoutError, withTimeout } from "@/lib/networkSync";
import { createSyncAuditRecord } from "@/lib/syncAudit";



export type PendingKind = "transaction" | "transfer";
export type PendingStatus = "pending" | "syncing" | "failed";

export interface PendingMovement {
  local_id: string;
  client_sync_id: string;
  created_at: string;
  status: PendingStatus;
  kind: PendingKind;
  payload: Record<string, any>;
  error?: string;
  attempt_count?: number;
  last_attempt_at?: string;
  last_error?: string;
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
    attempt_count: 0,
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
    i.local_id === local_id
      ? { ...i, status: "failed" as PendingStatus, error, last_error: error, last_attempt_at: new Date().toISOString() }
      : i
  );
  writeAll(items);
};

const markStatus = (local_id: string, status: PendingStatus, error?: string) => {
  const items = readAll().map(i =>
    i.local_id === local_id
      ? { ...i, status, ...(error !== undefined ? { error, last_error: error } : { error: undefined }) }
      : i
  );
  writeAll(items);
};

const recordAttempt = (local_id: string) => {
  const items = readAll().map(i =>
    i.local_id === local_id
      ? { ...i, attempt_count: (i.attempt_count || 0) + 1, last_attempt_at: new Date().toISOString() }
      : i
  );
  writeAll(items);
};

// Back-compat re-export
export const isNetworkError = (err: any): boolean => isLikelyNetworkOrTimeoutError(err);

/** Returns existing matching row id (or null) if a likely duplicate already exists in Supabase. */
async function findDuplicate(kind: PendingKind, payload: Record<string, any>): Promise<string | null> {
  try {
    if (kind === "transaction") {
      const q = supabase.from("transactions").select("id, notes, budget_item_id").limit(5)
        .eq("user_id", payload.user_id)
        .eq("date", payload.date)
        .eq("account_id", payload.account_id)
        .eq("transaction_type", payload.transaction_type)
        .eq("amount", payload.amount);
      const res: any = await withTimeout(q as unknown as Promise<any>, 5000, "dup-check-tx");
      if (res?.error || !res?.data) return null;
      const wantNotes = payload.notes ?? null;
      const wantBid = payload.budget_item_id ?? null;
      const match = (res.data as any[]).find((r: any) =>
        (r.notes ?? null) === wantNotes && (r.budget_item_id ?? null) === wantBid
      );
      return match?.id ?? null;
    } else {
      const q = supabase.from("transfers").select("id, notes").limit(5)
        .eq("user_id", payload.user_id)
        .eq("date", payload.date)
        .eq("from_account_id", payload.from_account_id)
        .eq("to_account_id", payload.to_account_id)
        .eq("amount", payload.amount);
      const res: any = await withTimeout(q as unknown as Promise<any>, 5000, "dup-check-tr");
      if (res?.error || !res?.data) return null;
      const wantNotes = payload.notes ?? null;
      const match = (res.data as any[]).find((r: any) => (r.notes ?? null) === wantNotes);
      return match?.id ?? null;
    }
  } catch {
    return null;
  }
}

let syncing = false;

export const syncPendingMovements = async (): Promise<{ synced: number; failed: number; skipped: number }> => {
  if (syncing) return { synced: 0, failed: 0, skipped: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { synced: 0, failed: 0, skipped: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  let skipped = 0;
  try {
    const items = readAll().filter(i => i.status === "pending");
    for (const item of items) {
      markStatus(item.local_id, "syncing");
      recordAttempt(item.local_id);

      // Duplicate guard
      try {
        const dupId = await findDuplicate(item.kind, item.payload);
        if (dupId) {
          removePendingMovement(item.local_id);
          skipped++;
          continue;
        }
      } catch {
        // duplicate check failure shouldn't block; fall through to insert
      }

      const table = item.kind === "transaction" ? "transactions" : "transfers";
      try {
        const insertPromise = supabase.from(table as any).insert(item.payload as any);
        const res: any = await withTimeout(insertPromise as unknown as Promise<any>, 8000, `insert-${table}`);
        const error = res?.error;
        if (error) {
          if (isLikelyNetworkOrTimeoutError(error)) {
            markStatus(item.local_id, "pending");
          } else {
            // Unique-violation / conflict
            const code = (error as any)?.code;
            if (code === "23505") {
              markPendingFailed(item.local_id, "Sync conflict — review needed");
            } else {
              markPendingFailed(item.local_id, error.message || "Sync failed");
            }
            failed++;
          }
        } else {
          removePendingMovement(item.local_id);
          synced++;
        }
      } catch (e: any) {
        if (isLikelyNetworkOrTimeoutError(e)) {
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
  return { synced, failed, skipped };
};

// Cross-tab sync via storage event
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) notify();
  });
}
