/**
 * Generate blog markdown body via Anthropic API (CI + local).
 * Requires ANTHROPIC_API_KEY. Validates against scripts/site-gates.json minima.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function loadJson(rel) {
  return JSON.parse(await readFile(path.join(ROOT, rel), "utf8"));
}

function countWords(md) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function countH2(md) {
  return (md.match(/^##\s+/gm) || []).length;
}

function hasListOrTable(md) {
  return (
    /^\s*[-*]\s+/m.test(md) || /^\s*\d+\.\s+/m.test(md) || /^\|.+\|$/m.test(md)
  );
}

function sanitizeBody(body) {
  return body
    .split("\n")
    .filter((line) => !/^#\s[^#]/.test(line.trim()))
    .join("\n")
    .trim();
}

function conversionPath(gates, site) {
  const bq = gates.blogQuality || {};
  return (
    bq.conversionPath ||
    bq.contactLinkSubstring ||
    bq.requireBodySubstring ||
    site.conversionPath ||
    "/contact/"
  );
}

function validateBody(body, gates, site) {
  const bq = gates.blogQuality || {};
  const minWords = bq.minWords ?? 500;
  const minH2 = bq.minH2 ?? 3;
  const conversion = conversionPath(gates, site);
  const issues = [];
  if (/^#\s[^#]/m.test(body))
    issues.push("do not use # H1 in body (template adds title as H1)");
  if (countWords(body) < minWords) issues.push(`need ${minWords}+ words`);
  if (countH2(body) < minH2) issues.push(`need ${minH2}+ H2 sections`);
  if (!hasListOrTable(body)) issues.push("need a list or table");
  if (!body.includes(conversion)) issues.push(`need link to ${conversion}`);
  if (!/how this was created/i.test(body))
    issues.push('need "## How this was created" section');
  if (bq.proDisclaimerPattern) {
    const re = new RegExp(bq.proDisclaimerPattern, "i");
    if (!re.test(body)) issues.push("need HVAC on-site assessment disclaimer");
  }
  if (bq.requireSourcesHeading === true && !/^##\s+sources/im.test(body)) {
    issues.push('need "## Sources" section');
  }
  return issues;
}

async function callAnthropic(system, user, maxTokens = 8192) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it to GitHub Actions secrets for automated posts.",
    );
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.BLOG_LLM_MODEL || "claude-sonnet-4-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Anthropic API ${res.status}: ${(await res.text()).slice(0, 400)}`,
    );
  }
  const data = await res.json();
  return (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
}

function systemPrompt(brand, domain, vertical) {
  if (vertical === "hvac") {
    return `You write educational HVAC and home-energy blog posts for ${brand} (${domain}), Ontario homeowners.
Output Markdown body only — no YAML frontmatter. Conservative, people-first advice. Never claim guaranteed savings or outcomes.
Include a clear disclaimer that content is not a substitute for an on-site assessment by a qualified HVAC technician.`;
  }
  if (vertical === "renovation") {
    return `You write people-first renovation guides for ${brand} (${domain}), a Hamilton/GTA contractor.
Output Markdown body only — no YAML frontmatter. Practical Ontario-specific notes on permits, timelines, and budgeting where relevant.
Never guarantee exact prices, timelines, or permit outcomes. Use ranges and "often / may / typically" language.`;
  }
  return `You write people-first blog posts for ${brand} (${domain}), an Ontario cash home buyer.
Output Markdown body only — no YAML frontmatter, no code fences wrapping the whole post.
Be specific to Ontario markets. Avoid hype and guaranteed outcomes. Use "may", "often", "typically" for legal/tax/process topics and add a short disclaimer when needed.
Never copy generic SEO templates; each post must be unique in structure and examples.`;
}

/**
 * @param {{ slug: string, title: string, metaDescription?: string, tags?: string[] }} topic
 */
export async function generateBlogBody(topic) {
  const gates = await loadJson("scripts/site-gates.json");
  let site;
  try {
    site = await loadJson("automation/site.json");
  } catch {
    site = {
      brand: process.env.BLOG_SITE_BRAND || "Site",
      domain: process.env.BLOG_SITE_DOMAIN || "example.com",
      conversionPath: "/contact/",
      audience: "Ontario homeowners",
    };
  }
  const brand = process.env.BLOG_SITE_BRAND || site.brand;
  const domain = process.env.BLOG_SITE_DOMAIN || site.domain;
  const conversion = conversionPath(gates, site);
  const minWords = gates.blogQuality?.minWords ?? 500;
  const minH2 = gates.blogQuality?.minH2 ?? 3;
  const vertical = site.vertical || "real-estate";
  const queueSource = site.queueSource || "automation/topic-queue.json";

  const system = systemPrompt(brand, domain, vertical);

  const hvacExtra =
    vertical === "hvac"
      ? `
- Include a visible ## Sources section with at least one authoritative link (e.g. Natural Resources Canada)
- Include disclaimer wording like: not a substitute for an on-site assessment by a qualified HVAC technician`
      : "";

  const userPrompt = `Write a complete blog post for slug "${topic.slug}".

Title: ${topic.title}
Meta description hint: ${topic.metaDescription || ""}
Tags: ${(topic.tags || []).join(", ")}
Audience: ${site.audience || "Ontario homeowners"}

Hard requirements:
- Use only ## H2 and lower — never a single # H1 (the site template renders the title as H1)
- At least ${minWords} words
- At least ${minH2} sections with ## H2 headings (not counting "How this was created")
- Include a bullet or numbered list OR a markdown table
- Include a markdown link to ${conversion}
- End with ## How this was created — state the topic was queued in ${queueSource}, body was AI-drafted for human review before publish, and name ${brand}
- Do not use phrases like "guaranteed rankings" or "#1 on Google"${hvacExtra}`;

  let body = "";
  let lastIssues = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const retry =
      attempt > 1
        ? `\n\nPrevious draft failed checks: ${lastIssues.join("; ")}. Fix all of them.`
        : "";
    body = sanitizeBody(await callAnthropic(system, userPrompt + retry));
    lastIssues = validateBody(body, gates, site);
    if (lastIssues.length === 0) break;
    console.log(
      `[blog-generate] attempt ${attempt} failed checks: ${lastIssues.join("; ")}`,
    );
  }
  if (lastIssues.length > 0) {
    throw new Error(`Generated body failed gates: ${lastIssues.join("; ")}`);
  }
  return body;
}
