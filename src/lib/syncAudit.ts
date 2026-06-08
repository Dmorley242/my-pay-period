// Local-only sync audit store. Tracks the lifecycle of offline movements
// from local save to server sync. Persists in localStorage.

export type SyncAuditKind = "transaction" | "transfer";
export type SyncAuditAction = "create";
export type SyncAuditStatus =
  | "pending"
  | "synced"
  | "skipped_duplicate"
  | "failed"
  | "conflict"
  | "resolved_server"
  | "resolved_local";

export interface SyncAuditRecord {
  audit_id: string;
  local_id: string;
  client_sync_id: string;
  kind: SyncAuditKind;
  action: SyncAuditAction;
  status: SyncAuditStatus;
  local_payload: Record<string, any>;
  server_payload?: Record<string, any> | null;
  server_id?: string | null;
  created_at: string;
  attempted_at?: string | null;
  synced_at?: string | null;
  resolved_at?: string | null;
  error?: string | null;
}

const LS_KEY = "syncAudit:v1";
const MAX_RECORDS = 500;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => { try { l(); } catch {} });

export const subscribeSyncAudit = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

const readAll = (): SyncAuditRecord[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeAll = (items: SyncAuditRecord[]) => {
  try {
    // Cap size to avoid unbounded growth
    const trimmed = items.length > MAX_RECORDS ? items.slice(items.length - MAX_RECORDS) : items;
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
    notify();
  } catch {}
};

const genId = () => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  } catch {}
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const getSyncAuditRecords = (): SyncAuditRecord[] => readAll();

export const getAuditByLocalId = (local_id: string): SyncAuditRecord | undefined =>
  readAll().find(r => r.local_id === local_id);

export const getAuditByClientSyncId = (client_sync_id: string): SyncAuditRecord | undefined =>
  readAll().find(r => r.client_sync_id === client_sync_id);

export interface CreateAuditInput {
  local_id: string;
  client_sync_id: string;
  kind: SyncAuditKind;
  local_payload: Record<string, any>;
}

export const createSyncAuditRecord = (input: CreateAuditInput): SyncAuditRecord => {
  const items = readAll();
  const record: SyncAuditRecord = {
    audit_id: genId(),
    local_id: input.local_id,
    client_sync_id: input.client_sync_id,
    kind: input.kind,
    action: "create",
    status: "pending",
    local_payload: input.local_payload,
    server_payload: null,
    server_id: null,
    created_at: new Date().toISOString(),
    attempted_at: null,
    synced_at: null,
    resolved_at: null,
    error: null,
  };
  items.push(record);
  writeAll(items);
  return record;
};

export interface UpdateAuditPatch {
  status?: SyncAuditStatus;
  server_payload?: Record<string, any> | null;
  server_id?: string | null;
  attempted_at?: string | null;
  synced_at?: string | null;
  resolved_at?: string | null;
  error?: string | null;
}

const updateBy = (
  predicate: (r: SyncAuditRecord) => boolean,
  patch: UpdateAuditPatch,
): SyncAuditRecord | undefined => {
  const items = readAll();
  let updated: SyncAuditRecord | undefined;
  const next = items.map(r => {
    if (!predicate(r)) return r;
    updated = { ...r, ...patch };
    return updated;
  });
  if (updated) writeAll(next);
  return updated;
};

export const updateAuditByLocalId = (local_id: string, patch: UpdateAuditPatch) =>
  updateBy(r => r.local_id === local_id, patch);

export const updateAuditByClientSyncId = (client_sync_id: string, patch: UpdateAuditPatch) =>
  updateBy(r => r.client_sync_id === client_sync_id, patch);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) notify();
  });
}
