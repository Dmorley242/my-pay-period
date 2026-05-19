import { cn } from "@/lib/utils";

/**
 * WealthOS monogram badge — a luxury private-bank style "W" mark.
 * Use anywhere the app needs a premium brand symbol, avatar, or placeholder.
 */
export function WBadge({
  className,
  size = 36,
  variant = "gold",
}: {
  className?: string;
  size?: number;
  variant?: "gold" | "primary" | "dark";
}) {
  const bg =
    variant === "gold"
      ? "var(--gradient-gold)"
      : variant === "primary"
      ? "var(--gradient-primary)"
      : "var(--gradient-bank)";
  const stroke = variant === "gold" ? "hsl(228 45% 8%)" : "hsl(0 0% 100%)";
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex items-center justify-center shrink-0 rounded-[28%] overflow-hidden",
        className
      )}
      style={{
        width: size,
        height: size,
        background: bg,
        boxShadow:
          variant === "gold"
            ? "var(--shadow-gold), inset 0 1px 0 hsl(0 0% 100% / 0.35), inset 0 -1px 0 hsl(0 0% 0% / 0.25)"
            : "var(--shadow-glow), inset 0 1px 0 hsl(0 0% 100% / 0.18)",
      }}
    >
      <span
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, hsl(0 0% 100% / 0.28) 0%, hsl(0 0% 100% / 0) 50%)",
        }}
      />
      <svg
        viewBox="0 0 32 32"
        width={size * 0.62}
        height={size * 0.62}
        fill="none"
        stroke={stroke}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative"
      >
        {/* Stylized W with serif feet */}
        <path d="M5 8 L10 24 L16 13 L22 24 L27 8" />
        <path d="M3.5 8 H8" opacity="0.85" />
        <path d="M24 8 H28.5" opacity="0.85" />
      </svg>
    </span>
  );
}

export default WBadge;
