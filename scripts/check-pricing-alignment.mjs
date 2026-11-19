/**
 * Assert pricing-estimator.json stays aligned with FAQ/blog bands AND JobTread anchors.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { COMPLEX_GROSS_MARGIN, sellFromDirectCost } from "./pricing-markup.mjs";

const ROOT = process.cwd();
const pricingPath = path.join(ROOT, "src/data/pricing-estimator.json");
const calibrationPath = path.join(ROOT, "src/data/pricing-calibration.json");
const faqPath = path.join(
  ROOT,
  "src/content/faqs/01-how-much-does-basement-renovation-cost.json",
);

function assertTrue(condition, message) {
  if (!condition) throw new Error(message);
}

function overlaps(a, b) {
  return a[0] <= b[1] && b[0] <= a[1];
}

function contains(range, value) {
  return value >= range[0] && value <= range[1];
}

function main() {
  const pricing = JSON.parse(readFileSync(pricingPath, "utf8"));
  const calibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
  JSON.parse(readFileSync(faqPath, "utf8")); // FAQ exists

  // FAQ states basic basement $25K–$40K; legal suite $60K–$120K (FAQ ceiling is stale vs JobTread)
  const faqBasic = [25000, 40000];
  const faqSuiteFloor = 60000;

  const basementBasic = pricing.basePricing.basement.basic.medium.basic;
  const basementSuiteMid =
    pricing.basePricing.basement["legal-suite"].medium.mid;
  const basementSuitePremium =
    pricing.basePricing.basement["legal-suite"].medium.premium;

  assertTrue(
    overlaps(basementBasic, faqBasic),
    `Basement basic tier ${basementBasic} must overlap FAQ basic range ${faqBasic}`,
  );
  assertTrue(
    basementBasic[0] >= faqBasic[0],
    `Basement basic floor ${basementBasic[0]} must be >= FAQ floor ${faqBasic[0]}`,
  );
  assertTrue(
    basementSuiteMid[0] >= faqSuiteFloor,
    `Legal-suite floor ${basementSuiteMid[0]} must be >= FAQ suite floor ${faqSuiteFloor}`,
  );

  // JobTread anchor: Rachel #586 basement legal suite ~$176K
  const rachelAnchor = calibration.anchorJobs.find(
    (j) => j.jobNumber === "586",
  );
  assertTrue(
    rachelAnchor,
    "Rachel #586 anchor must be documented in calibration",
  );
  assertTrue(
    contains(basementSuitePremium, rachelAnchor.proposalExclHst),
    `Rachel anchor $${rachelAnchor.proposalExclHst} must fall within legal-suite medium premium ${basementSuitePremium}`,
  );

  // JobTread anchor: Jackie #604 garden suite ADU
  const jackieAnchor = calibration.anchorJobs.find(
    (j) => j.jobNumber === "604",
  );
  assertTrue(
    jackieAnchor,
    "Jackie #604 anchor must be documented in calibration",
  );
  assertTrue(
    pricing.meta.gardenSuiteNote?.includes("604"),
    "meta.gardenSuiteNote must reference Jackie #604",
  );

  const aduMid =
    pricing.basePricing["garden-suite-adu"]["standalone-adu"].standard.mid;
  assertTrue(
    contains(aduMid, jackieAnchor.proposalExclHst),
    `Jackie #604 $${jackieAnchor.proposalExclHst} must fall within standalone ADU standard mid ${aduMid}`,
  );

  // Winchester #593 — internal cost uplifted to client sell price
  const winchesterAnchor = calibration.anchorJobs.find(
    (j) => j.jobNumber === "593",
  );
  assertTrue(
    winchesterAnchor,
    "Winchester #593 anchor must be documented in calibration",
  );
  const winchesterSell =
    winchesterAnchor.sellPriceExclHst ||
    sellFromDirectCost(winchesterAnchor.costExclHst, COMPLEX_GROSS_MARGIN);
  assertTrue(
    winchesterSell > winchesterAnchor.costExclHst,
    `#593 sell price $${winchesterSell} must exceed internal cost $${winchesterAnchor.costExclHst}`,
  );
  const fourplexMid =
    pricing.basePricing["multi-unit"]["duplex-to-fourplex"]["4-unit"].mid;
  assertTrue(
    contains(fourplexMid, winchesterSell),
    `Fourplex mid band ${fourplexMid} must contain uplifted sell anchor $${winchesterSell}`,
  );
  assertTrue(
    winchesterAnchor.costExclHst < fourplexMid[0],
    `#593 cost $${winchesterAnchor.costExclHst} must stay below client-facing floor ${fourplexMid[0]}`,
  );

  assertTrue(
    pricing.scopes?.["garden-suite-adu"]?.length === 3,
    "Garden suite ADU must have 3 scope tiers",
  );
  assertTrue(
    pricing.scopes?.["multi-unit"]?.length === 4,
    "Multi-unit must have 4 scope tiers",
  );
  assertTrue(
    pricing.meta.confidence["garden-suite-adu"] === "medium",
    "Garden suite ADU confidence must be medium",
  );
  assertTrue(
    pricing.meta.confidence["multi-unit"] === "low",
    "Multi-unit confidence must be low (interpolated triplex)",
  );
  assertTrue(
    (pricing.addons?.["garden-suite-adu"]?.length || 0) >= 3,
    "Garden suite ADU must have optional extras",
  );
  assertTrue(
    (pricing.addons?.["multi-unit"]?.length || 0) >= 4,
    "Multi-unit must have optional extras",
  );

  // Budget guide bands (home-renovation-budget-guide.md) — floors only; ceilings may exceed with JobTread
  const budgetGuide = {
    bathroom: [15000, 40000],
    kitchen: [25000, 80000],
    basementFinish: [25000, 60000],
    flooring: [8000, 20000],
  };

  const bathOverall = pricing.blogBands.bathroom.overall;
  assertTrue(
    bathOverall[0] >= budgetGuide.bathroom[0],
    "Bathroom floor below budget guide",
  );
  // Rewari #658 ($191K) and 686 ($83K) justify ceiling above budget guide
  assertTrue(
    bathOverall[1] >= 55000,
    "Bathroom ceiling must reflect JobTread premium master baths",
  );

  const kitchenOverall = pricing.blogBands.kitchen.overall;
  assertTrue(
    kitchenOverall[0] >= budgetGuide.kitchen[0],
    "Kitchen floor below budget guide",
  );
  assertTrue(
    kitchenOverall[1] <= budgetGuide.kitchen[1] + 20000,
    "Kitchen ceiling too far above budget guide",
  );

  const flooringOverall = pricing.blogBands.flooring.overall;
  assertTrue(
    flooringOverall[0] >= budgetGuide.flooring[0],
    "Flooring floor below budget guide",
  );
  // Hani #692 ($53.8K) justifies ceiling above blog $22K
  assertTrue(
    flooringOverall[1] >= 50000,
    "Flooring ceiling must reflect JobTread anchor (Hani #692)",
  );

  const basementFull = pricing.basePricing.basement.full.medium.mid;
  assertTrue(
    overlaps(basementFull, budgetGuide.basementFinish),
    `Basement full tier ${basementFull} must overlap budget guide finish ${budgetGuide.basementFinish}`,
  );

  const legalSuiteBand = pricing.blogBands.basement.legalSuite;
  assertTrue(
    legalSuiteBand[0] >= faqSuiteFloor,
    "Legal suite blog band floor must be >= FAQ floor",
  );
  assertTrue(
    contains(legalSuiteBand, rachelAnchor.proposalExclHst),
    `Legal suite blog band ${legalSuiteBand} must contain Rachel anchor $${rachelAnchor.proposalExclHst}`,
  );

  assertTrue(
    pricing.meta.hstExcluded === true,
    "meta.hstExcluded must be true",
  );
  assertTrue(
    pricing.meta.pricingModel?.includesOverheadAndProfit === true,
    "meta.pricingModel must state ranges include overhead and profit",
  );
  assertTrue(
    pricing.meta.pricingModel?.targetGrossMarginPct >= 25,
    "Target gross margin must be at least 25%",
  );
  assertTrue(
    pricing.scopes?.basement?.length === 3,
    "Basement must have 3 scope tiers",
  );
  assertTrue(
    pricing.meta.confidence.basement === "medium",
    "Basement confidence must be medium after Rachel anchor",
  );

  // Bathroom room labels must not use sq ft
  const bathSizes = pricing.sizes.bathroom.map((s) => s.label).join(" ");
  assertTrue(
    !bathSizes.includes("sq ft"),
    "Bathroom sizes must use room types, not sq ft",
  );

  // Basement sizes must reference Hamilton footprints
  const basementSizeDesc = pricing.sizes.basement.map((s) => s.label).join(" ");
  assertTrue(
    basementSizeDesc.includes("600"),
    "Basement sizes must start at 600 sq ft",
  );

  console.log("Pricing alignment check passed.");
}

main();
