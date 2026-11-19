export function fmtCad(n: number): string {
  return "$" + n.toLocaleString("en-CA");
}

export function fmtRange(range: [number, number]): string {
  if (range[0] === 0 && range[1] === 0) return "Included";
  if (range[0] === range[1]) return fmtCad(range[0]);
  return `${fmtCad(range[0])} – ${fmtCad(range[1])}`;
}

export function splitName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function estimateSummaryText(
  estimate: {
    min: number;
    max: number;
    typeLabel: string;
    scopeLabel?: string | null;
    sizeLabel: string;
    finishLabel: string;
    addonLabels?: string[];
    id?: string;
  },
  siteUrl: string,
): string {
  const lines = [
    `Online price guide estimate: ${fmtCad(estimate.min)} – ${fmtCad(estimate.max)} (excl. HST)`,
    `Project: ${estimate.typeLabel}`,
    estimate.scopeLabel ? `Scope: ${estimate.scopeLabel}` : null,
    `Size: ${estimate.sizeLabel}`,
    `Finish: ${estimate.finishLabel}`,
  ].filter(Boolean) as string[];

  if (estimate.addonLabels?.length) {
    lines.push(`Add-ons: ${estimate.addonLabels.join(", ")}`);
  }
  if (estimate.id) {
    lines.push(`Saved estimate: ${siteUrl}/estimate/s/${estimate.id}/`);
  }
  return lines.join("\n");
}
