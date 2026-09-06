import { estimateSummaryText } from "./estimate-format";
import type { SavedEstimate } from "./estimate-types";

// JobTread customer Lead Source and job Remodel Type options, verified 2026-09-06.
export const LEAD_SOURCES = [
  "Referral", "Cybertruck", "Banner Sign", "Facebook", "Google", "Home Advisor",
  "Instagram", "Internet Search", "Price Guide", "Website",
];
export const REMODEL_TYPES = [
  "New construction", "Remodel", "Addition", "Exterior project", "General contracting", "Other",
];

export function inferRemodelType(type: string, scope?: string | null): string {
  if (
    scope === "legal-suite" ||
    type === "garden-suite-adu" ||
    type === "multi-unit"
  ) {
    return "New construction";
  }
  return "Remodel";
}

export function buildJobName(estimate: SavedEstimate): string {
  const market = estimate.market?.split("&")[0]?.trim() || "Hamilton";
  const parts = ["Price Guide", estimate.typeLabel];
  if (estimate.scopeLabel) parts.push(estimate.scopeLabel);
  parts.push(market);
  return parts.join(" — ");
}

export function buildProjectNotes(
  estimate: SavedEstimate,
  siteUrl: string,
  extraNotes?: string,
): string {
  const summary = estimateSummaryText(estimate, siteUrl);
  if (!extraNotes?.trim()) return summary;
  return `${summary}\n\nAdditional notes:\n${extraNotes.trim()}`;
}

export function defaultHearAbout(source?: string): string {
  if (source === "price-guide" || !source) return "Price Guide";
  return source;
}
