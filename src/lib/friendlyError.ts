// Maps Supabase/PostgREST errors to safe, generic user-facing messages.
// Raw error is logged to the console for debugging; never shown in the UI.

type AnyErr =
  | {
      message?: string;
      code?: string;
      status?: number;
      name?: string;
      __isAuthError?: boolean;
    }
  | null
  | undefined;

const PG_CODE_MAP: Record<string, string> = {
  "23505": "This record already exists.",
  "23503": "Can't complete this action because of a related record.",
  "23502": "A required field is missing.",
  "23514": "Some values are invalid.",
  "22P02": "One of the values has the wrong format.",
  "22001": "One of the values is too long.",
  "42501": "You don't have permission to do that.",
  "42P01": "Something went wrong. Please try again.",
  PGRST301: "You don't have permission to do that.",
  PGRST116: "No matching record was found.",
};

export function friendlyError(err: AnyErr, fallback = "Something went wrong. Please try again."): string {
  if (!err) return fallback;

  // Always log raw error for debugging
  // eslint-disable-next-line no-console
  console.error("[error]", err);

  // Auth errors from Supabase are generally safe to surface.
  if (err.__isAuthError || err.name === "AuthApiError" || err.name === "AuthError") {
    return err.message || fallback;
  }

  if (err.code && PG_CODE_MAP[err.code]) return PG_CODE_MAP[err.code];

  const msg = (err.message || "").toLowerCase();
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return "You don't have permission to do that.";
  }
  if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return "This record already exists.";
  }
  if (msg.includes("foreign key")) {
    return "Can't complete this action because of a related record.";
  }
  if (msg.includes("violates not-null") || msg.includes("null value")) {
    return "A required field is missing.";
  }
  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return "Network error. Check your connection and try again.";
  }

  return fallback;
}
