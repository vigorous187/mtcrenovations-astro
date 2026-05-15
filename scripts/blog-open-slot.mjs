/**
 * MTC: open one draft PR from blog-calendar.json (first status pending without file).
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";

const ROOT = process.cwd();
const calendarPath = path.join(ROOT, "blog-calendar.json");
const blogDir = path.join(ROOT, "src", "content", "blog");
const runsDir = path.join(ROOT, "automation", "blog-runs", "mtc");

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
    console.log(`Branch ${branch} already exists on origin — skipping.`);
    return;
  }
  try {
    execSync(`git checkout -b ${branch}`, { stdio: "inherit", cwd: ROOT });
  } catch {
    execSync(`git checkout ${branch}`, { stdio: "inherit", cwd: ROOT });
  }

  const body = `## Outline\n\n**Topic:** ${picked.topic}\n**Keyword:** ${picked.keyword}\n**Type:** ${picked.type}\n\n## How this was created\n\nDraft slot opened from \`blog-calendar.json\` (id ${picked.id}). Replace this outline with people-first content; set \`draft: false\` when ready to publish.\n`;

  const fm = `---
title: "${String(picked.topic).replace(/"/g, '\\"')}"
metaTitle: "${String(picked.topic).slice(0, 70).replace(/"/g, '\\"')}"
metaDescription: "${`Practical guide: ${picked.keyword}. Hamilton and GTA homeowners — MTC Renovations.`.slice(0, 160).replace(/"/g, '\\"')}"
author: "MTC Renovations"
datePublished: "${picked.targetDate || today}"
dateModified: "${today}"
tags: ${JSON.stringify([picked.type || "guide", "Hamilton"])}
draft: true
howCreated: calendar-queue
---

${body}`;

  await mkdir(blogDir, { recursive: true });
  const outPath = path.join(blogDir, `${picked.slug}.md`);
  await writeFile(outPath, fm, "utf8");

  await mkdir(runsDir, { recursive: true });
  const logPath = path.join(runsDir, `${today}.md`);
  await writeFile(
    logPath,
    `# Blog run ${today}\n- Calendar id: ${picked.id}\n- Slug: ${picked.slug}\n- Branch: ${branch}\n`,
    { flag: "a" },
  );

  const cal = JSON.parse(await readFile(calendarPath, "utf8"));
  for (const row of cal) {
    if (row.id === picked.id) {
      row.status = "draft-pr";
      break;
    }
  }
  await writeFile(calendarPath, JSON.stringify(cal, null, 2) + "\n", "utf8");

  execSync(`git add "${outPath}" "${logPath}" "${calendarPath}"`, {
    stdio: "inherit",
    cwd: ROOT,
  });

  execSync(`git commit -m "chore(blog): open draft slot ${picked.slug}"`, {
    stdio: "inherit",
    cwd: ROOT,
  });
  execSync(`git push -u origin ${branch}`, { stdio: "inherit", cwd: ROOT });

  try {
    execSync(
      `gh pr create --head ${branch} --title "Blog draft: ${picked.slug}" --body "Automated draft from blog-calendar. Complete content before merge; update calendar status to published when live."`,
      { stdio: "inherit", cwd: ROOT, env: { ...process.env } },
    );
  } catch {
    console.log("gh pr create failed — branch pushed; open PR manually.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
