const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-US");

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatCents(cents: number | null | undefined): string {
  return cents == null ? "—" : currencyFormatter.format(cents / 100);
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? "—" : numberFormatter.format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (value == null) return "—";

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export function formatCurrency(value: number | null | undefined): string {
  return value == null ? "—" : currencyFormatter.format(value);
}

export function sumNullable(values: Array<number | null | undefined>): number | null {
  return values.some((value) => value == null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value as number), 0);
}
