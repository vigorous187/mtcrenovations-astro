/** Client-facing sell price model — mirrors scripts/pricing-markup.mjs */

export const STANDARD_GROSS_MARGIN = 0.3;
export const COMPLEX_GROSS_MARGIN = 0.35;
export const SUB_COORDINATION_MARKUP = 0.15;

export function sellFromDirectCost(
  directCost: number,
  grossMargin = STANDARD_GROSS_MARGIN,
): number {
  if (!directCost || directCost <= 0) return 0;
  return Math.round(directCost / (1 - grossMargin));
}

export interface PricingModelMeta {
  priceBasis: string;
  includesOverheadAndProfit: boolean;
  includesSubcontractorCoordination: boolean;
  targetGrossMarginPct: number;
  complexProjectGrossMarginPct: number;
  subcontractorCoordinationMarkupPct: number;
  sellPriceNote: string;
  costAnchorNote?: string;
}

export const DEFAULT_PRICING_MODEL: PricingModelMeta = {
  priceBasis: "client-facing sell ranges",
  includesOverheadAndProfit: true,
  includesSubcontractorCoordination: true,
  targetGrossMarginPct: 30,
  complexProjectGrossMarginPct: 35,
  subcontractorCoordinationMarkupPct: 15,
  sellPriceNote:
    "All ranges are what a homeowner pays MTC — including overhead, subcontractor coordination, and profit. They are not internal job cost.",
  costAnchorNote:
    "When only internal cost exists, a gross-margin uplift is applied before displaying a range.",
};
