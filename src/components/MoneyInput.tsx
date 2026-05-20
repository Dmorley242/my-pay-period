import * as React from "react";
import { Input } from "@/components/ui/input";

export interface MoneyInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: string;
  onChange: (decimalString: string) => void;
}

const digitsFromValue = (v: string): string => {
  if (v === "" || v == null) return "";
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return "";
  return Math.round(Math.abs(n) * 100).toString();
};

const formatDisplay = (digits: string): string => {
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, placeholder = "$0.00", ...rest }, ref) => {
    const [digits, setDigits] = React.useState<string>(() => digitsFromValue(value));

    React.useEffect(() => {
      const ext = digitsFromValue(value);
      setDigits((prev) => (prev === ext ? prev : ext));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12);
      setDigits(raw);
      if (!raw) {
        onChange("");
      } else {
        onChange((parseInt(raw, 10) / 100).toFixed(2));
      }
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatDisplay(digits)}
        onChange={handleChange}
        placeholder={placeholder}
        {...rest}
      />
    );
  },
);
MoneyInput.displayName = "MoneyInput";

export default MoneyInput;
