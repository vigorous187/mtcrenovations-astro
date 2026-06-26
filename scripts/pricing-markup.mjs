/**
 * GC sell-price model for the Price Guide.
 *
 * Industry practice (NAHB remodeler CODB, GC estimating guides):
 * - Client estimates = direct costs + overhead + sub coordination + profit
 * - Markup ≠ margin: 30% gross margin → Price = Cost / (1 - 0.30)
 * - Complex renovation / multi-unit carries higher risk → higher target margin
 * - Subcontractor bids are never passed at zero markup
 */

/** NAHB residential remodeler gross profit benchmark (~30%) */
export const STANDARD_GROSS_MARGIN = 0.3;

/** Multi-unit, structural, ADU — higher scope risk */
export const COMPLEX_GROSS_MARGIN = 0.35;

/** Markup applied to subcontractor-led add-on scopes (coordination + liability) */
export const SUB_COORDINATION_MARKUP = 0.15;

export function sellFromDirectCost(
  directCost,
  grossMargin = STANDARD_GROSS_MARGIN,
) {
  if (!directCost || directCost <= 0) return null;
  return Math.round(directCost / (1 - grossMargin));
}

export function sellRangeFromDirectCost(
  directCost,
  grossMargin = STANDARD_GROSS_MARGIN,
  spread = 0.1,
) {
  const mid = sellFromDirectCost(directCost, grossMargin);
  if (!mid) return null;
  return [Math.round(mid * (1 - spread)), Math.round(mid * (1 + spread))];
}

/** Lump-sum add-on from subcontractor bid → client line item */
export function sellAddonFromSubBid(subBid) {
  return Math.round(subBid * (1 + SUB_COORDINATION_MARKUP));
}

export function sellAddonRangeFromSubBid(subBidLow, subBidHigh) {
  return [sellAddonFromSubBid(subBidLow), sellAddonFromSubBid(subBidHigh)];
}

export const PRICING_MODEL_META = {
  priceBasis: "client-facing sell ranges",
  includesOverheadAndProfit: true,
  includesSubcontractorCoordination: true,
  targetGrossMarginPct: Math.round(STANDARD_GROSS_MARGIN * 100),
  complexProjectGrossMarginPct: Math.round(COMPLEX_GROSS_MARGIN * 100),
  subcontractorCoordinationMarkupPct: Math.round(SUB_COORDINATION_MARKUP * 100),
  sellPriceNote:
    "All ranges are what a homeowner pays MTC — including overhead, subcontractor coordination, and profit. They are not internal job cost.",
  costAnchorNote:
    "When JobTread only has internal cost (no approved client price), we apply a gross-margin uplift before showing a range.",
};
