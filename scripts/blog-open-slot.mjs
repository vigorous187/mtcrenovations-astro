/**
 * FORGE_PIPELINE_VERSION=2 — MTC variant
 * Opens a PR from blog-calendar.json (pending rows). AI-generates body when BLOG_AUTO_GENERATE=1.
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { generateBlogBody } from "./blog-generate-body.mjs";

const ROOT = process.cwd();
const calendarPath = path.join(ROOT, "blog-calendar.json");
const blogDir = path.join(ROOT, "src", "content", "blog");
const runsDir = path.join(ROOT, "automation", "blog-runs", "mtc");

const autoGenerate = process.env.BLOG_AUTO_GENERATE !== "0";
const forceRegenerate =
  process.env.BLOG_FORCE_REGENERATE === "1" ||
  process.argv.includes("--regenerate");

const PR_BODY_GENERATED = [
  "Automated blog post (AI-drafted, build gates passed).",
  "",
  "**Before merge:** skim for accuracy, then merge (deploy.yml ships to production + IndexNow).",
].join("\n");

async function fileExists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isoWeek(d = new Date()) {
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - y) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function yamlQuote(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function runBuild() {
  const r = spawnSync("npm", ["run", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error("npm run build failed after generating post");
  }
}

function ensurePullRequest(branch, slug, generated) {
  const title = generated ? `Blog: ${slug}` : `Blog draft: ${slug}`;
  try {
    execSync(
      `gh pr create --head ${branch} --title ${JSON.stringify(title)} --body ${JSON.stringify(PR_BODY_GENERATED)}`,
      { stdio: "inherit", cwd: ROOT, env: { ...process.env } },
    );
  } catch {
    console.log(`gh pr create failed for ${branch} — open PR manually.`);
  }
}

async function isPlaceholderPost(filePath) {
  if (!(await fileExists(filePath))) return true;
  const raw = await readFile(filePath, "utf8");
  return (
    /howCreated:\s*["']?(calendar-queue|human-outlined-queue)["']?/i.test(
      raw,
    ) ||
    /Replace this outline with people-first content/i.test(raw) ||
    /Draft slot opened from/i.test(raw)
  );
}

function calendarToTopic(row) {
  return {
    slug: row.slug,
    title: row.topic,
    metaDescription: `Practical guide: ${row.keyword}. Hamilton and GTA homeowners — MTC Renovations.`,
    tags: [row.type || "guide", "Hamilton"],
  };
}

function buildFrontmatter(row, { generated, slotOpened }) {
  const draft = generated ? "false" : "true";
  const howCreated = generated ? "automation-llm" : "calendar-queue";
  return `---
title: "${yamlQuote(row.topic)}"
metaTitle: "${yamlQuote(String(row.topic).slice(0, 60))}"
metaDescription: "${yamlQuote(
    `Practical guide: ${row.keyword}. Hamilton and GTA homeowners — MTC Renovations.`.slice(
      0,
      160,
    ),
  )}"
author: "MTC Renovations"
datePublished: "${row.targetDate || slotOpened}"
dateModified: "${slotOpened}"
tags: ${JSON.stringify([row.type || "guide", "Hamilton"])}
draft: ${draft}
howCreated: "${howCreated}"
---

`;
}

async function writePost(row, outPath, slotOpened) {
  let body;
  let generated = false;
  const topic = calendarToTopic(row);

  if (autoGenerate) {
    console.log(`[blog-open-slot] Generating body for ${row.slug}…`);
    body = await generateBlogBody(topic);
    generated = true;
  } else {
    body = `## Outline

**Topic:** ${row.topic}
**Keyword:** ${row.keyword}
**Type:** ${row.type}

## How this was created

Draft slot opened from \`blog-calendar.json\` (id ${row.id}). Replace this outline with people-first content.
`;
  }

  const fm = buildFrontmatter(row, { generated, slotOpened });
  await mkdir(blogDir, { recursive: true });
  await writeFile(outPath, fm + body, "utf8");

  if (generated) {
    console.log("[blog-open-slot] Running npm run build…");
    runBuild();
  }
  return generated;
}

async function markCalendarDraftPr(calendarId) {
  const cal = JSON.parse(await readFile(calendarPath, "utf8"));
  for (const row of cal) {
    if (row.id === calendarId) {
      row.status = "draft-pr";
      break;
    }
  }
  await writeFile(calendarPath, JSON.stringify(cal, null, 2) + "\n", "utf8");
}

async function main() {
  const calendar = JSON.parse(await readFile(calendarPath, "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  let picked = null;
  for (const row of calendar) {
    if (row.status !== "pending") continue;
    const md = path.join(blogDir, `${row.slug}.md`);
    if (!(await fileExists(md))) {
      picked = row;
      break;
    }
  }

  if (!picked) {
    console.log("No pending calendar slot without file — skipping.");
    return;
  }

  const branch = `automation/blog/${isoWeek()}-${picked.slug}`;
  const outPath = path.join(blogDir, `${picked.slug}.md`);

  try {
    execSync("git fetch origin", { stdio: "pipe", cwd: ROOT });
  } catch {
    /* ignore */
  }

  const remote = execSync(`git ls-remote --heads origin "${branch}"`, {
    encoding: "utf8",
    cwd: ROOT,
  }).trim();

  if (remote) {
    execSync(`git checkout ${branch}`, { stdio: "inherit", cwd: ROOT });
    try {
      execSync("git checkout origin/HEAD -- automation/site.json", {
        stdio: "pipe",
        cwd: ROOT,
      });
    } catch {
      /* optional */
    }
    const placeholder = await isPlaceholderPost(outPath);
    if (!forceRegenerate && !placeholder) {
      const openPrs = execSync(
        `gh pr list --head ${branch} --state open --json number --jq 'length'`,
        { encoding: "utf8", cwd: ROOT, env: { ...process.env } },
      ).trim();
      if (openPrs === "0") {
        ensurePullRequest(branch, picked.slug, false);
      } else {
        console.log(`Branch ${branch} already has open PR — nothing to do.`);
      }
      return;
    }
    console.log(
      `[blog-open-slot] Regenerating ${picked.slug} on existing branch…`,
    );
  } else {
    try {
      execSync(`git checkout -b ${branch}`, { stdio: "inherit", cwd: ROOT });
    } catch {
      execSync(`git checkout ${branch}`, { stdio: "inherit", cwd: ROOT });
    }
  }

  const generated = await writePost(picked, outPath, today);
  await markCalendarDraftPr(picked.id);

  await mkdir(runsDir, { recursive: true });
  const logPath = path.join(runsDir, `${today}-${picked.slug}.md`);
  await writeFile(
    logPath,
    `# Blog run ${today} — ${picked.slug}\n- Calendar id: ${picked.id}\n- Branch: ${branch}\n- Status: ${generated ? "AI-generated, build passed" : "draft outline"}\n`,
    "utf8",
  );

  execSync(`git add "${outPath}" "${logPath}" "${calendarPath}"`, {
    stdio: "inherit",
    cwd: ROOT,
  });
  const msg = generated
    ? `chore(blog): generate post ${picked.slug}`
    : `chore(blog): open draft slot ${picked.slug}`;
  execSync(`git commit -m ${JSON.stringify(msg)}`, {
    stdio: "inherit",
    cwd: ROOT,
  });
  execSync(`git push -u origin ${branch}`, { stdio: "inherit", cwd: ROOT });

  const openPrs = execSync(
    `gh pr list --head ${branch} --state open --json number --jq 'length'`,
    { encoding: "utf8", cwd: ROOT, env: { ...process.env } },
  ).trim();
  if (openPrs === "0") {
    ensurePullRequest(branch, picked.slug, generated);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
