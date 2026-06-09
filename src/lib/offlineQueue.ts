import { supabase } from "@/integrations/supabase/client";
import { isLikelyNetworkOrTimeoutError, withTimeout } from "@/lib/networkSync";
import { createSyncAuditRecord, updateAuditByLocalId } from "@/lib/syncAudit";
import { toast } from "sonner";



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

const genId = (prefix: string) => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  } catch {}
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const addPendingMovement = (kind: PendingKind, payload: Record<string, any>): PendingMovement => {
  const items = readAll();
  const local_id = genId("local");
  const client_sync_id = genId("csid");
  const payloadWithSync = { ...payload, client_sync_id };
  const item: PendingMovement = {
    local_id,
    client_sync_id,
    created_at: new Date().toISOString(),
    status: "pending",
    kind,
    payload: payloadWithSync,
    attempt_count: 0,
  };
  items.push(item);
  writeAll(items);
  try {
    createSyncAuditRecord({
      local_id,
      client_sync_id,
      kind,
      local_payload: payloadWithSync,
    });
  } catch {}
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

const TX_COMPARE_FIELDS = ["date", "account_id", "transaction_type", "amount", "budget_item_id", "notes", "pay_period_id", "client_sync_id"];
const TR_COMPARE_FIELDS = ["date", "from_account_id", "to_account_id", "amount", "notes", "pay_period_id", "client_sync_id"];

const norm = (v: any) => {
  if (v === undefined || v === "") return null;
  return v;
};
const sameDate = (a: any, b: any) => {
  const na = norm(a); const nb = norm(b);
  if (na === nb) return true;
  if (!na || !nb) return false;
  // server returns "YYYY-MM-DD"; compare date prefix
  return String(na).slice(0, 10) === String(nb).slice(0, 10);
};
const sameAmount = (a: any, b: any) => Number(a) === Number(b);

function comparePayloads(kind: PendingKind, local: Record<string, any>, server: Record<string, any>): boolean {
  const fields = kind === "transaction" ? TX_COMPARE_FIELDS : TR_COMPARE_FIELDS;
  for (const f of fields) {
    if (f === "date") { if (!sameDate(local[f], server[f])) return false; continue; }
    if (f === "amount") { if (!sameAmount(local[f], server[f])) return false; continue; }
    if (norm(local[f]) !== norm(server[f])) return false;
  }
  return true;
}

/** Look up an existing server row by client_sync_id. Returns the row or null. */
async function findByClientSyncId(kind: PendingKind, payload: Record<string, any>): Promise<any | null> {
  if (!payload?.client_sync_id || !payload?.user_id) return null;
  try {
    const table = kind === "transaction" ? "transactions" : "transfers";
    const q = supabase.from(table as any).select("*")
      .eq("user_id", payload.user_id)
      .eq("client_sync_id", payload.client_sync_id)
      .limit(1);
    const res: any = await withTimeout(q as unknown as Promise<any>, 5000, "csid-check");
    if (res?.error || !res?.data || !res.data.length) return null;
    return res.data[0];
  } catch {
    return null;
  }
}

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
let conflictToastShown = false;

export const syncPendingMovements = async (): Promise<{ synced: number; failed: number; skipped: number; conflicts: number }> => {
  if (syncing) return { synced: 0, failed: 0, skipped: 0, conflicts: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { synced: 0, failed: 0, skipped: 0, conflicts: 0 };
  syncing = true;
  conflictToastShown = false;
  let synced = 0;
  let failed = 0;
  let skipped = 0;
  let conflicts = 0;
  try {
    const items = readAll().filter(i => i.status === "pending");
    for (const item of items) {
      markStatus(item.local_id, "syncing");
      recordAttempt(item.local_id);
      const attemptedAt = new Date().toISOString();
      updateAuditByLocalId(item.local_id, { attempted_at: attemptedAt });

      // Part 1: client_sync_id lookup first
      try {
        const existing = await findByClientSyncId(item.kind, item.payload);
        if (existing) {
          const match = comparePayloads(item.kind, item.payload, existing);
          if (match) {
            updateAuditByLocalId(item.local_id, {
              status: "skipped_duplicate",
              server_id: existing.id,
              server_payload: existing,
              synced_at: new Date().toISOString(),
            });
            removePendingMovement(item.local_id);
            skipped++;
            continue;
          } else {
            updateAuditByLocalId(item.local_id, {
              status: "conflict",
              server_id: existing.id,
              server_payload: existing,
              error: "Local payload does not match server row for client_sync_id",
            });
            markPendingFailed(item.local_id, "Sync conflict — review needed");
            conflicts++;
            if (!conflictToastShown) {
              conflictToastShown = true;
              try { toast.error("Sync conflict — review needed"); } catch {}
            }
            continue;
          }
        }
      } catch {
        // csid check failure shouldn't block; fall through
      }

      // Legacy duplicate guard (no client_sync_id match found)
      try {
        const dupId = await findDuplicate(item.kind, item.payload);
        if (dupId) {
          updateAuditByLocalId(item.local_id, {
            status: "skipped_duplicate",
            server_id: dupId,
            synced_at: new Date().toISOString(),
          });
          removePendingMovement(item.local_id);
          skipped++;
          continue;
        }
      } catch {
        // duplicate check failure shouldn't block; fall through to insert
      }

      const table = item.kind === "transaction" ? "transactions" : "transfers";
      try {
        const insertPromise = supabase.from(table as any).insert(item.payload as any).select().single();
        const res: any = await withTimeout(insertPromise as unknown as Promise<any>, 8000, `insert-${table}`);
        const error = res?.error;
        if (error) {
          if (isLikelyNetworkOrTimeoutError(error)) {
            markStatus(item.local_id, "pending");
            updateAuditByLocalId(item.local_id, { error: error.message || "Network/timeout" });
          } else {
            const code = (error as any)?.code;
            if (code === "23505") {
              // Unique-violation: likely client_sync_id collision — re-fetch and compare
              const existing = await findByClientSyncId(item.kind, item.payload);
              if (existing && comparePayloads(item.kind, item.payload, existing)) {
                updateAuditByLocalId(item.local_id, {
                  status: "skipped_duplicate",
                  server_id: existing.id,
                  server_payload: existing,
                  synced_at: new Date().toISOString(),
                });
                removePendingMovement(item.local_id);
                skipped++;
              } else {
                updateAuditByLocalId(item.local_id, {
                  status: "conflict",
                  server_id: existing?.id ?? null,
                  server_payload: existing ?? null,
                  error: error.message || "Sync conflict",
                });
                markPendingFailed(item.local_id, "Sync conflict — review needed");
                conflicts++;
                if (!conflictToastShown) {
                  conflictToastShown = true;
                  try { toast.error("Sync conflict — review needed"); } catch {}
                }
              }
            } else {
              updateAuditByLocalId(item.local_id, {
                status: "failed",
                error: error.message || "Sync failed",
              });
              markPendingFailed(item.local_id, error.message || "Sync failed");
              failed++;
            }
          }
        } else {
          const serverRow = res?.data ?? null;
          const match = serverRow ? comparePayloads(item.kind, item.payload, serverRow) : true;
          if (match) {
            updateAuditByLocalId(item.local_id, {
              status: "synced",
              server_id: serverRow?.id ?? null,
              server_payload: serverRow,
              synced_at: new Date().toISOString(),
              error: null,
            });
            removePendingMovement(item.local_id);
            synced++;
          } else {
            updateAuditByLocalId(item.local_id, {
              status: "conflict",
              server_id: serverRow?.id ?? null,
              server_payload: serverRow,
              error: "Server row differs from local payload after insert",
            });
            markPendingFailed(item.local_id, "Sync conflict — review needed");
            conflicts++;
            if (!conflictToastShown) {
              conflictToastShown = true;
              try { toast.error("Sync conflict — review needed"); } catch {}
            }
          }
        }
      } catch (e: any) {
        if (isLikelyNetworkOrTimeoutError(e)) {
          markStatus(item.local_id, "pending");
          updateAuditByLocalId(item.local_id, { error: e?.message || "Network/timeout" });
        } else {
          updateAuditByLocalId(item.local_id, {
            status: "failed",
            error: e?.message || "Sync failed",
          });
          markPendingFailed(item.local_id, e?.message || "Sync failed");
          failed++;
        }
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed, skipped, conflicts };
};

// Cross-tab sync via storage event
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) notify();
  });
}
