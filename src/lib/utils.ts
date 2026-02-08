import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns the label to show for a user's role (e.g. "Broker" for employee + sales-broker). */
export function getDisplayRole(user: { role: string; employeeRole?: string }): string {
  const role = user.role;
  const empRole = (user as { employeeRole?: string }).employeeRole;
  if (role === "employee" && empRole) {
    if (empRole === "sales-broker" || empRole === "broker") return "Broker";
    if (empRole === "manager" || empRole === "operations-manager") return "Manager";
    if (empRole === "logistics-driver" || empRole === "driver") return "Driver";
  }
  return role.replace(/_/g, " ").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  labour: "Labour",
  fertilizer: "Fertilizer",
  chemical: "Chemical",
  fuel: "Fuel",
  other: "Other",
  space: "Crates Space",
  watchman: "Watchman",
  ropes: "Ropes",
  carton: "Carton",
  offloading_labour: "Offloading Labour",
  onloading_labour: "Onloading Labour",
  broker_payment: "Broker Payment",
};

/** Returns display label for an expense category. */
export function getExpenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

/**
 * Parses a quantity string that may be a number, decimal, or fraction (e.g. "1/2", "1/4", "1 1/2").
 * Used for inventory deduction and work log inputs so small amounts like ½ or 0.25 are supported.
 */
export function parseQuantityOrFraction(str: string): number {
  const s = String(str ?? "").trim();
  if (!s) return 0;
  // "a b/c" e.g. "1 1/2" -> a + b/c
  const mixed = s.match(/^\s*(\d+)\s+(\d+)\s*\/\s*(\d+)\s*$/);
  if (mixed) {
    const a = Number(mixed[1]);
    const b = Number(mixed[2]);
    const c = Number(mixed[3]);
    if (c !== 0 && Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c))
      return a + b / c;
  }
  // "a/b" e.g. "1/2", "1/4"
  const frac = s.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (den !== 0 && Number.isFinite(num) && Number.isFinite(den)) return num / den;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
