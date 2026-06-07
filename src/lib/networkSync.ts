import { supabase } from "@/integrations/supabase/client";

export const SAVE_TIMEOUT_MS = 7000;
export const CONNECTION_CHECK_TIMEOUT_MS = 4000;

export class TimeoutError extends Error {
  constructor(public label: string) {
    super(`Timeout: ${label}`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(p: Promise<T>, timeoutMs = SAVE_TIMEOUT_MS, label = "request"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new TimeoutError(label));
    }, timeoutMs);
    p.then(
      (v) => { if (done) return; done = true; clearTimeout(t); resolve(v); },
      (e) => { if (done) return; done = true; clearTimeout(t); reject(e); },
    );
  });
}

export function isTimeoutError(err: any): boolean {
  if (!err) return false;
  if (err instanceof TimeoutError) return true;
  if (err?.name === "TimeoutError") return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.startsWith("timeout:") || msg === "timeout";
}

export function isLikelyNetworkOrTimeoutError(err: any): boolean {
  if (!err) return false;
  if (isTimeoutError(err)) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("failed to fetch")) return true;
  if (msg.includes("networkerror")) return true;
  if (msg.includes("network error")) return true;
  if (msg.includes("load failed")) return true;
  if (msg.includes("fetch failed")) return true;
  if (msg.includes("aborted")) return true;
  if (err?.name === "TypeError" && msg.includes("fetch")) return true;
  // PostgREST/Supabase errors usually have a `code`. If a code is present, treat as DB/validation.
  if (err?.code) return false;
  return false;
}

/** Lightweight reachability check against Supabase. Returns true if a tiny request completes in time. */
export async function checkSupabaseConnection(timeoutMs = CONNECTION_CHECK_TIMEOUT_MS): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const p = supabase.auth.getSession();
    await withTimeout(p as unknown as Promise<unknown>, timeoutMs, "connection-check");
    return true;
  } catch {
    return false;
  }
}
