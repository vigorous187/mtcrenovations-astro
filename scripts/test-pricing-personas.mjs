/**
 * Run 10 test personas through pricing logic and print results for review.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const pricing = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "src/data/pricing-estimator.json"),
    "utf8",
  ),
);

const personas = [
  {
    name: "Hamilton bungalow — basic basement finish",
    type: "basement",
    scope: "basic",
    size: "medium",
    finish: "basic",
    addons: [],
  },
  {
    name: "Burlington family — full basement reno",
    type: "basement",
    scope: "full",
    size: "medium",
    finish: "mid",
    addons: [],
  },
  {
    name: "Hamilton legal suite investor",
    type: "basement",
    scope: "legal-suite",
    size: "medium",
    finish: "mid",
    addons: [],
  },
  {
    name: "Burlington powder room refresh",
    type: "bathroom",
    size: "powder",
    finish: "basic",
    addons: [],
  },
  {
    name: "Hamilton main bath mid-range",
    type: "bathroom",
    size: "main",
    finish: "mid",
    addons: ["heated-floor"],
  },
  {
    name: "Burlington master ensuite premium",
    type: "bathroom",
    size: "master",
    finish: "premium",
    addons: ["walk-in-shower", "double-vanity"],
  },
  {
    name: "Hamilton kitchen refresh (small)",
    type: "kitchen",
    size: "small",
    finish: "basic",
    addons: [],
  },
  {
    name: "Burlington standard kitchen mid-range",
    type: "kitchen",
    size: "medium",
    finish: "mid",
    addons: ["island"],
  },
  {
    name: "Hamilton main floor LVP",
    type: "flooring",
    size: "medium",
    finish: "mid",
    addons: ["baseboards"],
  },
  {
    name: "Burlington whole-home paint",
    type: "painting",
    size: "large",
    finish: "mid",
    addons: ["trim", "ceilings"],
  },
];

function fmt(n) {
  return "$" + n.toLocaleString("en-CA");
}

function getBase(p) {
  if (p.scope) {
    return pricing.basePricing[p.type][p.scope][p.size][p.finish];
  }
  return pricing.basePricing[p.type][p.size][p.finish];
}

function calc(p) {
  const base = getBase(p);
  let min = base[0];
  let max = base[1];
  const addonLines = [];

  for (const id of p.addons) {
    const addon = pricing.addons[p.type].find((a) => a.id === id);
    if (addon) {
      min += addon.range[0];
      max += addon.range[1];
      addonLines.push(
        `${addon.label}: ${fmt(addon.range[0])}–${fmt(addon.range[1])}`,
      );
    }
  }

  const cap = Math.round(base[1] * pricing.addonRules.maxAddonPctOfBase);
  const addonTotal = max - base[1];
  if (addonTotal > cap) {
    max = base[1] + cap;
  }

  return { min, max, base, addonLines };
}

console.log("Price Guide — 10 Test Personas\n");
console.log("Market: Hamilton & Burlington | Ranges exclude HST\n");

let pass = 0;
for (const p of personas) {
  const r = calc(p);
  const blogBand =
    pricing.blogBands[p.type]?.[p.size] || pricing.blogBands[p.type]?.overall;
  const inBand = blogBand
    ? r.base[0] >= blogBand[0] * 0.9 && r.base[1] <= blogBand[1] * 1.1
    : true;
  const status = inBand ? "OK" : "REVIEW";
  if (inBand) pass++;

  console.log(`${status} | ${p.name}`);
  console.log(
    `     Range: ${fmt(r.min)} – ${fmt(r.max)} (base ${fmt(r.base[0])}–${fmt(r.base[1])})`,
  );
  if (r.addonLines.length)
    console.log(`     Add-ons: ${r.addonLines.join("; ")}`);
  console.log("");
}

console.log(
  `Result: ${pass}/${personas.length} personas within blog bands (+15% ceiling buffer)`,
);
if (pass < personas.length) {
  console.warn("Some personas flagged for review — check before deploy.");
}
