#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";

const DEFAULT_ORIGIN = "https://www.mtcrenovations.ca";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, "..");

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
  if (node.content) walk(node.content, visit);
}

function elements(root, tagName) {
  const matches = [];
  walk(root, (node) => {
    if (node.tagName && (!tagName || node.tagName === tagName))
      matches.push(node);
  });
  return matches;
}

function attribute(node, name) {
  return node?.attrs?.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  )?.value;
}

function textContent(node) {
  if (node.nodeName === "#text") return node.value ?? "";
  return (node.childNodes ?? []).map(textContent).join("");
}

function hasAncestorTag(node, tagName) {
  let current = node?.parentNode;
  while (current) {
    if (current.tagName === tagName) return true;
    current = current.parentNode;
  }
  return false;
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function firstElement(root, tagName, predicate = () => true) {
  return elements(root, tagName).find(predicate);
}

function filesForRoute(distDir, pathname) {
  const clean = decodeURIComponent(pathname).replace(/\/+$/, "") || "/";
  if (clean === "/") return [path.join(distDir, "index.html")];
  const relative = clean.replace(/^\//, "");
  return [
    path.join(distDir, relative, "index.html"),
    path.join(distDir, `${relative}.html`),
  ];
}

function loadRedirects(distDir) {
  const redirects = new Set();
  const file = path.join(distDir, "_redirects");
  if (!fs.existsSync(file)) return redirects;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const source = line.trim().split(/\s+/)[0];
    if (source?.startsWith("/") && !source.includes("*")) {
      redirects.add(source.replace(/\/+$/, "") || "/");
    }
  }
  return redirects;
}

function routeExists(distDir, pathname, redirects) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (filesForRoute(distDir, pathname).some((file) => fs.existsSync(file)))
    return true;
  if (redirects.has(normalized)) return true;
  return (
    normalized === "/newleadintake" || normalized.startsWith("/estimate/s/")
  );
}

function isInternalUrl(value, origin) {
  if (
    !value ||
    /^(?:mailto:|tel:|sms:|javascript:|data:|blob:|#)/i.test(value)
  ) {
    return false;
  }
  try {
    return new URL(value, origin).origin === origin;
  } catch {
    return false;
  }
}

function assetExists(distDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const relative = decoded.replace(/^\/+/, "");
  return relative.length > 0 && fs.existsSync(path.join(distDir, relative));
}

function hasReservedImageSpace(node) {
  if (attribute(node, "width") && attribute(node, "height")) return true;
  if (/\.svg(?:$|[?#])/i.test(attribute(node, "src") ?? "")) return true;
  const style = attribute(node, "style") ?? "";
  if (/(?:^|;)\s*aspect-ratio\s*:\s*[^;]+/i.test(style)) return true;
  if (
    /(?:^|;)\s*(?:min-)?height\s*:\s*(?!auto\b)[^;]+/i.test(style) &&
    (/(?:^|;)\s*(?:min-)?width\s*:\s*(?!auto\b)[^;]+/i.test(style) ||
      /(?:^|\s)w-100(?:\s|$)/.test(attribute(node, "class") ?? ""))
  ) {
    return true;
  }
  const fillsReservedFrame = /(?:^|\s)h-100(?:\s|$)/.test(
    attribute(node, "class") ?? "",
  );
  const parentStyle = attribute(node.parentNode, "style") ?? "";
  return (
    fillsReservedFrame &&
    /(?:^|;)\s*(?:min-)?height\s*:\s*(?!auto\b)[^;]+/i.test(parentStyle)
  );
}

function structuredDataNodes(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(structuredDataNodes);
  if (Array.isArray(value["@graph"]))
    return value["@graph"].flatMap(structuredDataNodes);
  return [value];
}

function validateStructuredNode(node, label, failures) {
  const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  if (!types[0]) {
    failures.push(`${label}: JSON-LD node is missing @type`);
    return;
  }
  if (
    types.some((type) =>
      ["Organization", "LocalBusiness", "HomeAndConstructionBusiness"].includes(
        type,
      ),
    )
  ) {
    for (const property of ["name", "url"]) {
      if (!node[property])
        failures.push(`${label}: business JSON-LD missing ${property}`);
    }
  }
  if (types.some((type) => ["Article", "BlogPosting"].includes(type))) {
    for (const property of ["headline", "datePublished", "author"]) {
      if (!node[property])
        failures.push(`${label}: article JSON-LD missing ${property}`);
    }
  }
  if (
    types.includes("BreadcrumbList") &&
    !Array.isArray(node.itemListElement)
  ) {
    failures.push(`${label}: BreadcrumbList JSON-LD missing itemListElement`);
  }
}

function stylesheetUrls(distDir) {
  const urls = [];
  const cssDir = path.join(distDir, "_astro");
  if (!fs.existsSync(cssDir)) return urls;
  for (const file of fs.readdirSync(cssDir)) {
    if (!file.endsWith(".css")) continue;
    const css = fs.readFileSync(path.join(cssDir, file), "utf8");
    for (const match of css.matchAll(/url\((['"]?)(.*?)\1\)/gi))
      urls.push(match[2]);
  }
  return urls;
}

export function auditSite({
  distDir = path.join(PROJECT_DIR, "dist"),
  origin = DEFAULT_ORIGIN,
  maxImagesWithoutReservedSpace = 250,
  maxCompressedInitialJavaScriptBytes = 150 * 1024,
} = {}) {
  const failures = [];
  const warnings = [];
  const sitemapPath = path.join(distDir, "sitemap-0.xml");
  if (!fs.existsSync(sitemapPath)) {
    return {
      result: "FAIL",
      failures: ["dist/sitemap-0.xml is missing"],
      warnings,
      metrics: {},
    };
  }

  const sitemapXml = fs.readFileSync(sitemapPath, "utf8");
  const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(
    (match) => match[1].trim(),
  );
  if (!sitemapUrls.length) failures.push("sitemap-0.xml contains no URLs");
  if (new Set(sitemapUrls).size !== sitemapUrls.length)
    failures.push("sitemap-0.xml contains duplicate URLs");

  const redirects = loadRedirects(distDir);
  const seenTitles = new Map();
  const seenDescriptions = new Map();
  const checkedAssets = new Set();
  const checkedLinks = new Set();
  const initialScripts = new Set();
  const unreservedExamples = [];
  let imageCount = 0;
  let imagesWithoutReservedSpace = 0;
  let jsonLdCount = 0;
  let renderBlockingStylesheets = 0;

  for (const sitemapUrl of sitemapUrls) {
    let pageUrl;
    try {
      pageUrl = new URL(sitemapUrl);
    } catch {
      failures.push(`invalid sitemap URL: ${sitemapUrl}`);
      continue;
    }
    if (pageUrl.origin !== origin) {
      failures.push(`cross-origin sitemap URL: ${sitemapUrl}`);
      continue;
    }

    const pageFile = filesForRoute(distDir, pageUrl.pathname).find((file) =>
      fs.existsSync(file),
    );
    if (!pageFile) {
      failures.push(
        `${pageUrl.pathname}: sitemap target has no generated HTML`,
      );
      continue;
    }
    const label = path.relative(distDir, pageFile);
    const html = fs.readFileSync(pageFile, "utf8");
    const document = parse(html);

    for (const link of elements(document, "link")) {
      const rel = (attribute(link, "rel") ?? "").toLowerCase().split(/\s+/);
      const media = (attribute(link, "media") ?? "all").toLowerCase();
      if (
        rel.includes("stylesheet") &&
        !hasAncestorTag(link, "noscript") &&
        (media === "all" || media === "screen")
      ) {
        renderBlockingStylesheets += 1;
        failures.push(
          `${label}: render-blocking stylesheet ${attribute(link, "href") ?? "(inline URL missing)"}`,
        );
      }
    }

    const htmlElement = firstElement(document, "html");
    if (!attribute(htmlElement, "lang"))
      failures.push(`${label}: document language is missing`);
    for (const landmark of ["header", "nav", "main", "footer"]) {
      if (!elements(document, landmark).length)
        failures.push(`${label}: <${landmark}> landmark is missing`);
    }
    const main = firstElement(document, "main");
    const mainH1s = main ? elements(main, "h1") : [];
    if (mainH1s.length !== 1)
      failures.push(`${label}: expected exactly one main H1`);
    const skipLink = elements(document, "a").find(
      (node) =>
        attribute(node, "href")?.startsWith("#") &&
        /skip/i.test(textContent(node)),
    );
    if (!skipLink) failures.push(`${label}: skip link is missing`);

    const title = normalizeText(
      textContent(firstElement(document, "title") ?? {}),
    );
    const description =
      firstElement(
        document,
        "meta",
        (node) => attribute(node, "name")?.toLowerCase() === "description",
      ) &&
      attribute(
        firstElement(
          document,
          "meta",
          (node) => attribute(node, "name")?.toLowerCase() === "description",
        ),
        "content",
      );
    const canonicalElements = elements(document, "link").filter((node) =>
      (attribute(node, "rel") ?? "")
        .toLowerCase()
        .split(/\s+/)
        .includes("canonical"),
    );
    const canonical = attribute(canonicalElements[0], "href")?.trim() ?? "";
    const robots =
      attribute(
        firstElement(
          document,
          "meta",
          (node) => attribute(node, "name")?.toLowerCase() === "robots",
        ),
        "content",
      )?.toLowerCase() ?? "";
    if (!title) failures.push(`${label}: title is missing`);
    if (!description?.trim())
      failures.push(`${label}: meta description is missing`);
    if (canonicalElements.length !== 1)
      failures.push(`${label}: expected exactly one canonical`);
    if (canonical !== sitemapUrl)
      failures.push(
        `${label}: canonical ${canonical || "(missing)"} does not match ${sitemapUrl}`,
      );
    if (robots.includes("noindex"))
      failures.push(`${label}: sitemap URL is marked noindex`);
    if (title && seenTitles.has(title))
      failures.push(
        `${label}: duplicate title also used by ${seenTitles.get(title)}`,
      );
    if (description && seenDescriptions.has(description)) {
      failures.push(
        `${label}: duplicate description also used by ${seenDescriptions.get(description)}`,
      );
    }
    if (title) seenTitles.set(title, label);
    if (description) seenDescriptions.set(description, label);

    elements(document, "script")
      .filter(
        (node) =>
          attribute(node, "type")?.toLowerCase() === "application/ld+json",
      )
      .forEach((node, index) => {
        jsonLdCount += 1;
        try {
          const value = JSON.parse(textContent(node));
          for (const item of structuredDataNodes(value)) {
            validateStructuredNode(
              item,
              `${label} JSON-LD #${index + 1}`,
              failures,
            );
          }
        } catch (error) {
          failures.push(
            `${label}: invalid JSON-LD #${index + 1}: ${error.message}`,
          );
        }
      });

    for (const node of elements(document, "a")) {
      const href = attribute(node, "href");
      if (!isInternalUrl(href, origin)) continue;
      const target = new URL(href, origin);
      const key = `${label} -> ${target.pathname}`;
      if (checkedLinks.has(key)) continue;
      checkedLinks.add(key);
      if (
        !routeExists(distDir, target.pathname, redirects) &&
        !assetExists(distDir, target.pathname)
      ) {
        failures.push(`${label}: broken internal link ${href}`);
      }
    }

    const assetValues = [];
    for (const node of elements(document)) {
      if (
        ["img", "script", "source"].includes(node.tagName) &&
        attribute(node, "src")
      ) {
        assetValues.push(attribute(node, "src"));
      }
      if (node.tagName === "video" && attribute(node, "poster"))
        assetValues.push(attribute(node, "poster"));
      if (
        ["img", "source"].includes(node.tagName) &&
        attribute(node, "srcset")
      ) {
        assetValues.push(
          ...attribute(node, "srcset")
            .split(",")
            .map((candidate) => candidate.trim().split(/\s+/)[0]),
        );
      }
      if (node.tagName === "link" && attribute(node, "href")) {
        const rel = (attribute(node, "rel") ?? "").toLowerCase();
        const as = (attribute(node, "as") ?? "").toLowerCase();
        if (
          /stylesheet|icon|apple-touch-icon/.test(rel) ||
          (rel.includes("preload") &&
            ["image", "script", "style", "font"].includes(as))
        ) {
          assetValues.push(attribute(node, "href"));
        }
      }
      for (const match of (attribute(node, "style") ?? "").matchAll(
        /url\((['"]?)(.*?)\1\)/gi,
      )) {
        assetValues.push(match[2]);
      }
    }
    for (const value of assetValues.filter(Boolean)) {
      if (!isInternalUrl(value, origin)) continue;
      const assetUrl = new URL(value, origin);
      const key = `${label} -> ${assetUrl.pathname}`;
      if (checkedAssets.has(key)) continue;
      checkedAssets.add(key);
      if (!assetExists(distDir, assetUrl.pathname))
        failures.push(`${label}: missing internal asset ${value}`);
    }

    for (const image of elements(document, "img")) {
      imageCount += 1;
      const src = attribute(image, "src") ?? "unknown";
      if (attribute(image, "alt") === undefined)
        failures.push(`${label}: image is missing alt text (${src})`);
      if (!hasReservedImageSpace(image)) {
        imagesWithoutReservedSpace += 1;
        if (unreservedExamples.length < 12)
          unreservedExamples.push(`${label}: ${src}`);
      }
      const priority = attribute(image, "fetchpriority")?.toLowerCase();
      if (
        priority === "high" &&
        attribute(image, "loading")?.toLowerCase() === "lazy"
      ) {
        failures.push(
          `${label}: high-priority/LCP image is lazy-loaded (${src})`,
        );
      }
    }

    for (const button of elements(document, "button")) {
      const childAlt = elements(button, "img")
        .map((node) => attribute(node, "alt"))
        .find(Boolean);
      const name =
        normalizeText(textContent(button)) ||
        attribute(button, "aria-label") ||
        attribute(button, "aria-labelledby") ||
        attribute(button, "title") ||
        childAlt;
      if (!name) failures.push(`${label}: button has no accessible name`);
    }
    for (const control of elements(document).filter((node) =>
      ["input", "select", "textarea"].includes(node.tagName),
    )) {
      if (
        control.tagName === "input" &&
        attribute(control, "type")?.toLowerCase() === "hidden"
      )
        continue;
      const id = attribute(control, "id");
      const labelled =
        attribute(control, "aria-label") ||
        attribute(control, "aria-labelledby") ||
        hasAncestorTag(control, "label") ||
        (id &&
          elements(document, "label").some(
            (labelNode) => attribute(labelNode, "for") === id,
          ));
      if (!labelled)
        failures.push(`${label}: form control has no programmatic label`);
    }

    for (const script of elements(document, "script")) {
      const src = attribute(script, "src");
      if (src && isInternalUrl(src, origin)) {
        const url = new URL(src, origin);
        if (url.pathname.startsWith("/_astro/"))
          initialScripts.add(url.pathname);
      }
    }
  }

  for (const value of stylesheetUrls(distDir)) {
    if (!isInternalUrl(value, origin)) continue;
    const assetUrl = new URL(value, origin);
    if (!assetExists(distDir, assetUrl.pathname))
      failures.push(`generated CSS references missing asset ${value}`);
  }

  let compressedInitialJavaScriptBytes = 0;
  for (const scriptPath of initialScripts) {
    const absolute = path.join(distDir, scriptPath.replace(/^\//, ""));
    if (fs.existsSync(absolute))
      compressedInitialJavaScriptBytes += gzipSync(
        fs.readFileSync(absolute),
      ).byteLength;
  }
  if (compressedInitialJavaScriptBytes > maxCompressedInitialJavaScriptBytes) {
    failures.push(
      `compressed initial JavaScript is ${Math.ceil(compressedInitialJavaScriptBytes / 1024)} KB ` +
        `(budget: ${Math.ceil(maxCompressedInitialJavaScriptBytes / 1024)} KB)`,
    );
  }
  if (imagesWithoutReservedSpace > maxImagesWithoutReservedSpace) {
    failures.push(
      `${imagesWithoutReservedSpace} images do not reserve dimensions (baseline budget: ${maxImagesWithoutReservedSpace})`,
    );
  }
  if (imagesWithoutReservedSpace) {
    warnings.push(
      `${imagesWithoutReservedSpace} images do not reserve dimensions. Existing debt is budgeted fail-closed; examples: ${unreservedExamples.join("; ")}`,
    );
  }

  return {
    result: failures.length ? "FAIL" : "PASS",
    failures,
    warnings,
    metrics: {
      sitemapUrls: sitemapUrls.length,
      checkedInternalLinks: checkedLinks.size,
      checkedInternalAssets: checkedAssets.size,
      images: imageCount,
      imagesWithoutReservedSpace,
      jsonLdBlocks: jsonLdCount,
      renderBlockingStylesheets,
      compressedInitialJavaScriptBytes,
      browserAccessibility: "NOT TESTED",
      representativeMobileLighthouse: "NOT TESTED",
      fieldCoreWebVitals: "NOT TESTED",
    },
  };
}

function parseArgs(argv) {
  const option = (name, fallback) => {
    const index = argv.indexOf(name);
    return index === -1 ? fallback : argv[index + 1];
  };
  const config = JSON.parse(
    fs.readFileSync(path.join(SCRIPT_DIR, "site-gates.json"), "utf8"),
  );
  return {
    distDir: path.resolve(option("--dist", path.join(PROJECT_DIR, "dist"))),
    origin: option("--origin", DEFAULT_ORIGIN),
    reportPath: path.resolve(
      option(
        "--report",
        path.join(PROJECT_DIR, "artifacts", "site-quality-report.json"),
      ),
    ),
    maxImagesWithoutReservedSpace:
      config.websiteQuality.maxImagesWithoutReservedSpace,
    maxCompressedInitialJavaScriptBytes:
      config.websiteQuality.maxCompressedInitialJavaScriptBytes,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = parseArgs(process.argv.slice(2));
  const report = {
    gate: "SITE COMPLETE",
    generatedAt: new Date().toISOString(),
    origin: options.origin,
    distDir: options.distDir,
    ...auditSite(options),
  };
  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== "PASS") process.exitCode = 1;
}
