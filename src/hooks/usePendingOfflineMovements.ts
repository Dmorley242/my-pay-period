import { useEffect, useState } from "react";
import { getPendingMovements, subscribeOfflineQueue, type PendingMovement } from "@/lib/offlineQueue";

const isCountable = (m: PendingMovement) => m.status === "pending" || m.status === "syncing";

export function usePendingOfflineMovements(): PendingMovement[] {
  const [items, setItems] = useState<PendingMovement[]>(() => getPendingMovements());
  useEffect(() => {
    const refresh = () => setItems(getPendingMovements());
    const unsub = subscribeOfflineQueue(refresh);
    return () => unsub();
  }, []);
  return items.filter(isCountable);
}

/** Map of account_id -> signed amount delta from pending offline movements. */
export function computePendingAccountImpacts(items: PendingMovement[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const it of items) {
    if (!isCountable(it)) continue;
    const p = it.payload || {};
    if (it.kind === "transaction") {
      const type = String(p.transaction_type || "").toLowerCase();
      const amt = Number(p.amount) || 0;
      const acc = p.account_id as string | undefined;
      if (!acc || !amt) continue;
      if (type === "income" || type === "deposit") {
        map[acc] = (map[acc] || 0) + amt;
      } else if (type === "expense" || type === "withdrawal") {
        map[acc] = (map[acc] || 0) - amt;
      }
    } else if (it.kind === "transfer") {
      const amt = Number(p.amount) || 0;
      const from = p.from_account_id as string | undefined;
      const to = p.to_account_id as string | undefined;
      if (!amt) continue;
      if (from) map[from] = (map[from] || 0) - amt;
      if (to) map[to] = (map[to] || 0) + amt;
    }
  }
  return map;
}

/** Map of budget_item_id -> pending expense amount (positive = additional spent). */
export function computePendingBudgetSpend(items: PendingMovement[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const it of items) {
    if (!isCountable(it)) continue;
    if (it.kind !== "transaction") continue;
    const p = it.payload || {};
    const type = String(p.transaction_type || "").toLowerCase();
    if (type !== "expense") continue;
    const bid = p.budget_item_id as string | undefined | null;
    if (!bid) continue;
    const amt = Number(p.amount) || 0;
    if (!amt) continue;
    map[bid] = (map[bid] || 0) + amt;
  }
  return map;
}

/** Map of budget_sub_item_id -> pending expense amount. */
export function computePendingBudgetSubItemSpend(items: PendingMovement[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const it of items) {
    if (!isCountable(it)) continue;
    if (it.kind !== "transaction") continue;
    const p = it.payload || {};
    const type = String(p.transaction_type || "").toLowerCase();
    if (type !== "expense") continue;
    const sid = p.budget_sub_item_id as string | undefined | null;
    if (!sid) continue;
    const amt = Number(p.amount) || 0;
    if (!amt) continue;
    map[sid] = (map[sid] || 0) + amt;
  }
  return map;
}
