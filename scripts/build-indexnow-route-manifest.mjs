import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalSitemapUrls,
  canonicalUrlList,
  INDEXNOW_HOST,
} from "./submit-indexnow.mjs";

const GLOBAL_PATTERNS = [
  /^(?:astro\.config\.mjs|wrangler\.toml|package(?:-lock)?\.json|tailwind\.config\.[^/]+)$/,
  /^src\/(?:components|layouts|styles|data)\//,
  /^src\/(?:_redirects|env\.d\.ts)$/,
  /^public\//,
  /^scripts\/(?!.*(?:\.test\.mjs|^test-))/,
];

const NON_RUNTIME_PATTERNS = [
  /^\.github\//,
  /^docs\//,
  /^README(?:\.md)?$/,
  /^\.gitignore$/,
  /^scripts\/.*\.test\.mjs$/,
  /^scripts\/test-/,
];

function staticPageUrl(file) {
  const match = file.match(/^src\/pages\/(.+)\.astro$/);
  if (!match || match[1].includes("[") || match[1].startsWith("api/")) return null;
  const segments = match[1].split("/");
  if (segments.at(-1) === "index") segments.pop();
  const pathname = segments.length ? `/${segments.join("/")}/` : "/";
  return `https://${INDEXNOW_HOST}${pathname}`;
}

function blogUrl(file) {
  const match = file.match(/^src\/content\/blog\/([^/]+)\.(?:md|mdx)$/);
  return match ? `https://${INDEXNOW_HOST}/blog/${match[1]}/` : null;
}

export function selectChangedCanonicalUrls({ changedFiles, sitemapUrls }) {
  const canonicalSitemap = canonicalUrlList(sitemapUrls);
  const sitemapSet = new Set(canonicalSitemap);
  const directUrls = new Set();

  for (const file of changedFiles) {
    if (NON_RUNTIME_PATTERNS.some((pattern) => pattern.test(file))) continue;
    if (GLOBAL_PATTERNS.some((pattern) => pattern.test(file))) {
      return {
        policy: "all_canonical_urls",
        reason: `Global or uncertain runtime input changed: ${file}`,
        urlList: canonicalSitemap,
      };
    }

    const direct = staticPageUrl(file) || blogUrl(file);
    if (!direct || !sitemapSet.has(direct)) {
      return {
        policy: "all_canonical_urls",
        reason: `Changed path could not be mapped safely: ${file}`,
        urlList: canonicalSitemap,
      };
    }
    directUrls.add(direct);
  }

  return {
    policy: "changed_canonical_urls",
    reason: directUrls.size
      ? "Every runtime change mapped to an exact canonical sitemap URL."
      : "No public route changed.",
    urlList: [...directUrls].sort(),
  };
}

function changedFilesBetween(previousCommit, sourceCommit, execImpl = execFileSync) {
  return execImpl(
    "git",
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", `${previousCommit}..${sourceCommit}`, "--"],
    { encoding: "utf8" },
  ).split("\n").map((value) => value.trim()).filter(Boolean);
}

export async function buildChangedRouteManifest({
  root = process.cwd(),
  previousCommit,
  sourceCommit,
  outputPath = path.join("artifacts", "indexnow-changed-routes.json"),
  execImpl = execFileSync,
} = {}) {
  const sitemapXml = await readFile(path.join(root, "dist", "sitemap-0.xml"), "utf8");
  const sitemapUrls = canonicalSitemapUrls(sitemapXml);
  let selection;
  let changedFiles = [];

  try {
    if (!/^[0-9a-f]{40}$/.test(previousCommit ?? "") || !/^[0-9a-f]{40}$/.test(sourceCommit ?? "")) {
      throw new Error("full previous and source commits are required");
    }
    execImpl("git", ["merge-base", "--is-ancestor", previousCommit, sourceCommit], {
      encoding: "utf8",
      stdio: "pipe",
    });
    changedFiles = changedFilesBetween(previousCommit, sourceCommit, execImpl);
    selection = selectChangedCanonicalUrls({ changedFiles, sitemapUrls });
  } catch (error) {
    selection = {
      policy: "all_canonical_urls",
      reason: `Unable to prove a complete changed-route diff; fail closed to all canonical URLs: ${error.message}`,
      urlList: sitemapUrls,
    };
  }

  const manifest = {
    schemaVersion: 1,
    host: INDEXNOW_HOST,
    previousCommit: previousCommit || null,
    sourceCommit: sourceCommit || null,
    generatedAt: new Date().toISOString(),
    changedFiles,
    policy: selection.policy,
    reason: selection.reason,
    urlCount: selection.urlList.length,
    urlList: canonicalUrlList(selection.urlList),
  };
  const absoluteOutputPath = path.resolve(root, outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildChangedRouteManifest({
    previousCommit: process.env.PREVIOUS_RELEASE_COMMIT,
    sourceCommit: process.env.SOURCE_COMMIT,
    ...(process.env.INDEXNOW_MANIFEST_PATH
      ? { outputPath: process.env.INDEXNOW_MANIFEST_PATH }
      : {}),
  }).then((manifest) => {
    console.log(`IndexNow changed-route manifest: ${manifest.policy}, ${manifest.urlCount} URL(s).`);
  }).catch((error) => {
    console.error(`IndexNow manifest failed: ${error.message}`);
    process.exitCode = 1;
  });
}
