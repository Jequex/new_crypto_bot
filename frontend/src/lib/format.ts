export function formatNumber(value: number, maximumFractionDigits = 6): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "long"
  }).format(new Date(value));
}

export function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "--";
  }

  return `${formatNumber(value, 2)}%`;
}