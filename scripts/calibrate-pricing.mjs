/**
 * Pull JobTread approved proposals and compute P25/median/P75 by service category.
 * Output: src/data/pricing-calibration.json
 *
 * Requires JOBTREAD_GRANT_KEY + JOBTREAD_ORG_ID from ~/jobtread-mcp/.env
 */
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.env.HOME, "jobtread-mcp", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const GRANT_KEY = process.env.JOBTREAD_GRANT_KEY;
const ORG_ID = process.env.JOBTREAD_ORG_ID;
const PAVE_URL = "https://api.jobtread.com/pave";
const OUT = path.join(process.cwd(), "src/data/pricing-calibration.json");

const ANCHOR_JOB_NUMBERS = ["586", "604", "565", "593", "601"];

const SERVICE_PATTERNS = [
  {
    service: "garden-suite-adu",
    re: /garden suite|laneway|standalone adu|\badu\b|accessory dwelling/i,
  },
  {
    service: "multi-unit",
    re: /duplex|triplex|fourplex|multi-unit|multi unit|131 winchester/i,
  },
  { service: "basement", re: /basement|secondary suite|legal suite|underpin/i },
  { service: "bathroom", re: /bathroom|bath|washroom|shower|toilet/i },
  { service: "kitchen", re: /kitchen|cabinet/i },
  { service: "flooring", re: /floor|lvp|hardwood|carpet|stair/i },
  { service: "painting", re: /paint/i },
];

const EXCLUDE_RE =
  /test|do not use|dashboard|inbox|duct clean|gutter|furnace|warranty|concrete pad only|exterior paint only|masonry|landscape|water heater|front door|fan & electrical|leak repair|material list|selection|warranty claim/i;

/** Documented anchors when live API unavailable or job has no client price */
const DOCUMENTED_ANCHORS = [
  {
    jobNumber: "586",
    jobName: "118 Manning",
    customer: "Huiping (Rachel) Fang",
    service: "basement",
    scope: "legal-suite",
    proposalExclHst: 175990,
    contractInclHst: 175990,
    location: "118 Manning Ave, Hamilton ON",
    closedOn: "2024-03-25",
    jobId: "22NhHmSFTSVy",
  },
  {
    jobNumber: "604",
    jobName: "171 East 24th - 2 Story ADU",
    customer: "Jackie Nguyen",
    service: "garden-suite-adu",
    scope: "standalone-adu",
    proposalExclHst: 226904,
    approvedOrdersTotal: 309708,
    budgetTotal: 342194,
    location: "171 East 24th (Hamilton)",
    closedOn: "2026-04-02",
    jobId: "22Num5NcyJhu",
    note: "Standalone 2-story garden/ADU anchor for wizard",
  },
  {
    jobNumber: "565",
    jobName: "610 Queensdale",
    customer: "Garden suite (multi-unit corp)",
    service: "garden-suite-adu",
    scope: "large-adu",
    budgetExclHst: 538114,
    approvedOrderInclHst: 692878,
    location: "610 Queensdale, Hamilton",
    jobId: "22Nh8drqAazG",
    note: "Large garden suite / multi-building upper bound",
  },
  {
    jobNumber: "593",
    jobName: "131 Winchester",
    customer: "Duplex to fourplex",
    service: "multi-unit",
    scope: "duplex-to-fourplex",
    costExclHst: 629000,
    proposalExclHst: 0,
    location: "131 Winchester, Hamilton",
    jobId: null,
    note: "Open job — cost as floor, no sold client price",
  },
  {
    jobNumber: "601",
    jobName: "Garden suite / ADU (Job #601)",
    customer: "Documented anchor",
    service: "garden-suite-adu",
    scope: "standalone-adu",
    note: "Included in explicit anchor pull — verify in JobTread admin",
  },
  {
    jobNumber: "671",
    jobName: "Bathroom demo + renovation",
    customer: "Alexandre Cardoso",
    service: "bathroom",
    proposalExclHst: 26500,
    jobId: "22PVUsF6NfXB",
  },
  {
    jobNumber: "658",
    jobName: "Rewari Washroom Reno",
    customer: "Chand Rewari",
    service: "bathroom",
    scope: "master-premium",
    budgetExclHst: 191354,
    jobId: "22PTA6Ej3kNP",
  },
  {
    jobNumber: "692",
    jobName: "Hani Boutros - Floors",
    customer: "Hani Boutros",
    service: "flooring",
    proposalExclHst: 53800,
    jobId: "22PZFXKGreb8",
  },
];

async function pave(query) {
  const res = await fetch(PAVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: { $: { grantKey: GRANT_KEY }, ...query } }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json;
}

function classify(name, desc = "") {
  const text = `${name} ${desc || ""}`;
  if (EXCLUDE_RE.test(text)) return null;
  for (const { service, re } of SERVICE_PATTERNS) {
    if (re.test(text)) return service;
  }
  return null;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

function stats(values) {
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return { n: 0, confidence: "blog-only" };
  const median = percentile(sorted, 0.5);
  const filtered = median
    ? sorted.filter((v) => v <= median * 2 && v >= median * 0.4)
    : sorted;
  const s = filtered.length ? filtered : sorted;
  return {
    n: s.length,
    p25: percentile(s, 0.25),
    median: percentile(s, 0.5),
    p75: percentile(s, 0.75),
    min: s[0] ?? null,
    max: s[s.length - 1] ?? null,
    confidence: s.length >= 5 ? "high" : s.length >= 3 ? "medium" : "low",
  };
}

async function fetchAllDocuments() {
  const docs = [];
  let page = null;
  for (let i = 0; i < 20; i++) {
    const q = {
      organization: {
        $: { id: ORG_ID },
        documents: {
          $: page ? { page, size: 100 } : { size: 100 },
          nextPage: {},
          nodes: {
            id: {},
            name: {},
            type: {},
            status: {},
            price: {},
            priceWithTax: {},
            createdAt: {},
            job: { id: {}, name: {}, number: {}, description: {} },
          },
        },
      },
    };
    const res = await pave(q);
    const conn = res.organization.documents;
    docs.push(...conn.nodes);
    if (!conn.nextPage) break;
    page = conn.nextPage;
  }
  return docs;
}

async function fetchAnchorJobsByNumber() {
  const anchors = [];
  for (const num of ANCHOR_JOB_NUMBERS) {
    try {
      const res = await pave({
        organization: {
          $: { id: ORG_ID },
          jobs: {
            $: { where: { number: num }, size: 1 },
            nodes: {
              id: {},
              name: {},
              number: {},
              description: {},
              closedOn: {},
              location: { line1: {}, city: {}, province: {} },
              documents: {
                $: { size: 20 },
                nodes: {
                  name: {},
                  type: {},
                  status: {},
                  price: {},
                  priceWithTax: {},
                },
              },
            },
          },
        },
      });
      const job = res.organization?.jobs?.nodes?.[0];
      if (job) anchors.push(job);
    } catch (err) {
      console.warn(`Could not fetch anchor job #${num}:`, err.message);
    }
  }
  return anchors;
}

function buildBlogFallback() {
  return {
    generatedAt: new Date().toISOString(),
    source: "blog-faq-fallback",
    blogReference: {
      basement: {
        basic: [25000, 45000],
        full: [45000, 80000],
        legalSuite: [60000, 120000],
        overall: [25000, 120000],
      },
      bathroom: {
        basic: [15000, 22000],
        mid: [22000, 40000],
        premium: [38000, 65000],
        overall: [15000, 65000],
      },
      kitchen: {
        basic: [20000, 35000],
        mid: [40000, 60000],
        premium: [65000, 100000],
        overall: [20000, 100000],
      },
      flooring: {
        basic: [3000, 9000],
        mid: [9000, 20000],
        premium: [15000, 38000],
        overall: [8000, 58000],
      },
      painting: {
        basic: [2000, 6000],
        mid: [6000, 13000],
        premium: [13000, 20000],
        overall: [2000, 20000],
      },
      "garden-suite-adu": {
        standalone: [200000, 310000],
        large: [280000, 380000],
        overall: [180000, 400000],
      },
      "multi-unit": {
        duplexRenovation: [200000, 400000],
        duplexToTriplex: [350000, 500000],
        duplexToFourplex: [500000, 650000],
        overall: [200000, 650000],
      },
    },
  };
}

function reconcile(jtStats, blog) {
  const blogFloor = blog.overall[0];
  const blogCeiling = blog.overall[1];
  const buffer = Math.round(blogCeiling * 0.1);

  let floor = blogFloor;
  let ceiling = blogCeiling + buffer;

  if (jtStats.n >= 3 && jtStats.p25 && jtStats.p75) {
    floor = Math.max(blogFloor, Math.round(jtStats.p25 * 0.95));
    ceiling = Math.min(blogCeiling + buffer, Math.round(jtStats.p75 * 1.05));
    if (ceiling < floor) ceiling = blogCeiling;
  } else if (jtStats.n >= 1 && jtStats.median) {
    floor = Math.max(blogFloor, Math.round(jtStats.median * 0.85));
    ceiling = Math.max(blogCeiling, Math.round(jtStats.median * 1.15));
  }

  const confidence =
    jtStats.n >= 5
      ? "high"
      : jtStats.n >= 3
        ? "medium"
        : jtStats.n >= 1
          ? "low"
          : "blog-only";

  return { floor, ceiling, confidence };
}

function mergeAnchorFromApi(docAnchors, documented) {
  const byNumber = new Map(documented.map((a) => [a.jobNumber, { ...a }]));
  for (const job of docAnchors) {
    const num = String(job.number);
    if (!ANCHOR_JOB_NUMBERS.includes(num)) continue;
    const existing = byNumber.get(num) || { jobNumber: num };
    existing.jobName = job.name || existing.jobName;
    existing.jobId = job.id || existing.jobId;
    existing.location =
      [job.location?.line1, job.location?.city, job.location?.province]
        .filter(Boolean)
        .join(", ") || existing.location;
    existing.closedOn = job.closedOn || existing.closedOn;

    const approved = (job.documents?.nodes || []).filter(
      (d) => d.type === "customerOrder" && d.status === "approved" && d.price,
    );
    if (approved.length) {
      const max = Math.max(...approved.map((d) => d.price));
      existing.proposalExclHst = max;
    }
    byNumber.set(num, existing);
  }
  return [...byNumber.values()];
}

function buildServiceSections(byService, blogReference) {
  const sections = {};
  for (const service of [
    "basement",
    "bathroom",
    "kitchen",
    "flooring",
    "painting",
    "garden-suite-adu",
    "multi-unit",
  ]) {
    const jobs = byService[service] || [];
    const prices = jobs.map((j) => j.proposalPrice).filter((p) => p > 0);
    const jtStats = stats(prices);
    const blog = blogReference[service] || blogReference.basement;
    sections[
      service === "garden-suite-adu"
        ? "gardenSuiteAdu"
        : service === "multi-unit"
          ? "multiUnit"
          : service
    ] = {
      jobTread: jtStats,
      jobs: jobs.map((j) => ({
        name: j.jobName,
        price: j.proposalPrice,
        scope: j.scope,
      })),
      blogReference: blog,
      recommended: reconcile(jtStats, blog),
    };
  }

  sections.gardenSuiteAdu.recommended = {
    floor: 200000,
    ceiling: 380000,
    confidence: "medium",
    anchorJobs: ["604", "565"],
  };
  sections.multiUnit.recommended = {
    floor: 350000,
    ceiling: 650000,
    confidence: "low",
    anchorJobs: ["593"],
    note: "Triplex interpolated — no sold triplex JobTread job",
  };

  return sections;
}

async function main() {
  const blogFallback = buildBlogFallback();

  if (!GRANT_KEY || !ORG_ID) {
    console.error(
      "Missing JobTread credentials — writing documented anchor calibration",
    );
    const calibration = {
      generatedAt: new Date().toISOString(),
      source: "documented-anchors-fallback",
      notes:
        "Recalibrated from documented JobTread anchors. Ranges in pricing-estimator.json exclude HST unless noted.",
      anchorJobs: DOCUMENTED_ANCHORS,
      services: buildServiceSections({}, blogFallback.blogReference),
    };
    fs.writeFileSync(OUT, JSON.stringify(calibration, null, 2));
    console.log(`Wrote documented anchor calibration to ${OUT}`);
    return;
  }

  const [docs, apiAnchors] = await Promise.all([
    fetchAllDocuments(),
    fetchAnchorJobsByNumber(),
  ]);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);

  const byJob = new Map();
  for (const doc of docs) {
    if (doc.type !== "customerOrder") continue;
    if (doc.name !== "Proposal") continue;
    if (doc.status !== "approved") continue;
    if (!doc.job?.id || !doc.price || doc.price < 1000) continue;
    if (new Date(doc.createdAt) < cutoff) continue;

    const service = classify(doc.job.name, doc.job.description);
    if (!service) continue;

    const key = doc.job.id;
    if (!byJob.has(key)) {
      byJob.set(key, {
        jobId: key,
        jobName: doc.job.name,
        jobNumber: doc.job.number,
        service,
        proposalPrice: doc.price,
        createdAt: doc.createdAt,
      });
    } else {
      const existing = byJob.get(key);
      if (doc.price > existing.proposalPrice)
        existing.proposalPrice = doc.price;
    }
  }

  const byService = {};
  for (const entry of byJob.values()) {
    if (!byService[entry.service]) byService[entry.service] = [];
    byService[entry.service].push(entry);
  }

  const anchorJobs = mergeAnchorFromApi(apiAnchors, DOCUMENTED_ANCHORS);
  const calibration = {
    generatedAt: new Date().toISOString(),
    source: "jobtread",
    notes:
      "Recalibrated from JobTread approved proposals/budgets. Ranges in pricing-estimator.json exclude HST unless noted.",
    jobsAnalyzed: byJob.size,
    anchorJobs,
    services: buildServiceSections(byService, blogFallback.blogReference),
  };

  fs.writeFileSync(OUT, JSON.stringify(calibration, null, 2));
  console.log(`Calibration written to ${OUT} (${byJob.size} jobs)`);
  for (const [svc, data] of Object.entries(calibration.services)) {
    const r = data.recommended;
    console.log(
      `  ${svc}: n=${data.jobTread.n} confidence=${r.confidence} → $${r.floor.toLocaleString()}–$${r.ceiling.toLocaleString()}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
