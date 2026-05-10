export const money = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
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
