// Helpers to split a transaction's "notes" field into an optional display label
// and the user's actual notes. Older records may store everything in one string;
// new records save them joined by the unit-separator character so we can split
// them cleanly without changing the database schema.

const SEP = "\u001F";

export function parseTxNotes(raw: string | null | undefined): { label: string | null; notes: string | null } {
  if (!raw) return { label: null, notes: null };
  if (raw.includes(SEP)) {
    const [label, ...rest] = raw.split(SEP);
    const notes = rest.join(SEP);
    return { label: label || null, notes: notes || null };
  }
  // Backward compat: legacy records used " — " (em dash) to join label and notes.
  const emDashIdx = raw.indexOf(" — ");
  if (emDashIdx > 0) {
    const label = raw.slice(0, emDashIdx).trim();
    const notes = raw.slice(emDashIdx + 3).trim();
    return { label: label || null, notes: notes || null };
  }
  // Single-string legacy value: treat as label (that's how rows displayed before),
  // so the popup will not show it as user-written notes.
  return { label: raw || null, notes: null };
}

export function buildTxNotes(label: string | null | undefined, notes: string | null | undefined): string | null {
  const l = (label || "").trim();
  const n = (notes || "").trim();
  if (!l && !n) return null;
  if (!l) return n;
  if (!n) return l + SEP;
  return l + SEP + n;
}

// Convenience: get just the display label, falling back to a value
export function txLabel(raw: string | null | undefined, fallback: string): string {
  const { label } = parseTxNotes(raw);
  return label || fallback;
}

// Convenience: get just the user-written notes
export function txNotesOnly(raw: string | null | undefined): string {
  return parseTxNotes(raw).notes || "";
}

export function hasNotes(raw: string | null | undefined): boolean {
  return !!parseTxNotes(raw).notes;
}
