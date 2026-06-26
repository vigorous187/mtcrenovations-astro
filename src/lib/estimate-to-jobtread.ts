import { estimateSummaryText } from "./estimate-format";
import type { SavedEstimate } from "./estimate-types";

const REMODEL_TYPE =
  'Remodel (includes "Full Remodel," "Kitchen Remodel," "Bathroom Remodel," "Basement Remodel," etc.)';

const NEW_CONSTRUCTION_TYPE =
  'New Construction (includes "New Build," "Multi-unit Build," "Garage," etc';

export function inferRemodelType(type: string, scope?: string | null): string {
  if (
    scope === "legal-suite" ||
    type === "garden-suite-adu" ||
    type === "multi-unit"
  ) {
    return NEW_CONSTRUCTION_TYPE;
  }
  return REMODEL_TYPE;
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
