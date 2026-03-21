export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function pct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(0)}%`;
}

export function pctRaw(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatArchetype(archetype: string): string {
  return archetype
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function biasColor(bias: string): string {
  const lower = bias.toLowerCase();
  if (lower.includes("bullish")) return "text-accent-green";
  if (lower.includes("bearish")) return "text-accent-red";
  return "text-text-secondary";
}

export function riskColor(level: string): string {
  switch (level.toLowerCase()) {
    case "low":
      return "text-accent-green";
    case "moderate":
      return "text-accent-amber";
    case "elevated":
      return "text-orange-400";
    case "high":
      return "text-accent-red";
    default:
      return "text-text-secondary";
  }
}

export function riskBg(level: string): string {
  switch (level.toLowerCase()) {
    case "low":
      return "bg-accent-green/10 text-accent-green";
    case "moderate":
      return "bg-accent-amber/10 text-accent-amber";
    case "elevated":
      return "bg-orange-400/10 text-orange-400";
    case "high":
      return "bg-accent-red/10 text-accent-red";
    default:
      return "bg-surface-3 text-text-secondary";
  }
}

export function directionColor(direction: string): string {
  const d = direction.toLowerCase();
  if (d.includes("bullish") || d === "uptrend") return "text-accent-green";
  if (d.includes("bearish") || d === "downtrend") return "text-accent-red";
  return "text-text-secondary";
}
