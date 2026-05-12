export const money = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
};

export type AccountLike = { bank_name?: string | null; name?: string | null };

export const accountParts = (a: AccountLike) => {
  const bank = (a.bank_name || "").trim();
  let rest = (a.name || "").trim();
  rest = rest.replace(/^Credit Card\s*-\s*/i, "").replace(/^Credit Card$/i, "");
  if (bank) {
    const re = new RegExp("^" + bank.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*-?\\s*", "i");
    rest = rest.replace(re, "");
  }
  rest = rest.replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
  if (bank && rest.toLowerCase() === bank.toLowerCase()) rest = "";
  return { bank, alias: rest };
};

export const accountLabel = (a: AccountLike) => {
  const { bank, alias } = accountParts(a);
  if (!bank) return alias;
  return alias ? `${bank} ${alias}` : bank;
};

export const fmtDate = (d: string | Date) => {
  let date: Date;
  if (typeof d === "string") {
    // Parse YYYY-MM-DD as a local date to avoid UTC timezone shifting the day.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
  } else {
    date = d;
  }
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
