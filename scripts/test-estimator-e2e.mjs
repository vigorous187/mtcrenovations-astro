/**
 * End-to-end smoke test for Price Guide estimator wizard.
 * Run: node scripts/test-estimator-e2e.mjs
 * Requires dev server at http://localhost:4321
 */
import { chromium } from "playwright";

const BASE = process.env.ESTIMATOR_BASE || "http://localhost:4321";

const PERSONAS = [
  {
    name: "basement legal suite",
    type: "Basement",
    scope: "Legal Secondary Suite",
    size: "800–1,000 sq ft",
    finish: "Mid-Range",
    expectRange: /\$[\d,]+ – \$[\d,]+/,
  },
  {
    name: "basement basic finish",
    type: "Basement",
    scope: "Basic Finish",
    size: "600–800 sq ft",
    finish: "Basic",
    expectRange: /\$[\d,]+ – \$[\d,]+/,
  },
  {
    name: "bathroom main",
    type: "Bathroom",
    size: "Main Bathroom",
    finish: "Mid-Range",
    expectRange: /\$[\d,]+ – \$[\d,]+/,
  },
  {
    name: "bathroom with addons",
    type: "Bathroom",
    size: "Main Bathroom",
    finish: "Mid-Range",
    addons: ["Walk-in shower upgrade", "Heated floor"],
    expectRange: /\$[\d,]+ – \$[\d,]+/,
    expectAddonInLabel: "Walk-in shower upgrade",
  },
  {
    name: "kitchen medium",
    type: "Kitchen",
    size: "Standard Kitchen",
    finish: "Mid-Range",
    expectRange: /\$[\d,]+ – \$[\d,]+/,
  },
  {
    name: "flooring main floor",
    type: "Flooring",
    size: "Main floor",
    finish: "Mid-Range",
    expectRange: /\$[\d,]+ – \$[\d,]+/,
  },
  {
    name: "ADU standalone",
    type: "Garden Suite / ADU",
    scope: "Standalone ADU",
    size: "800–1,200 sq ft",
    finish: "Mid-Range",
    expectRange: /\$220,000 – \$300,000/,
  },
  {
    name: "duplex to fourplex",
    type: "Multi-Unit",
    scope: "Duplex → Fourplex",
    size: "4 units when complete",
    finish: "Mid-Range",
    expectRange: /\$900,000 – \$1,050,000/,
  },
  {
    name: "duplex renovation",
    type: "Multi-Unit",
    scope: "Duplex Renovation",
    size: "2 units when complete",
    finish: "Mid-Range",
    expectRange: /\$250,000 – \$350,000/,
  },
];

async function clickCard(page, label, within) {
  const root = within ? page.locator(within) : page;
  const card = root
    .locator(".estimator-card")
    .filter({ hasText: label })
    .first();
  await card.waitFor({ state: "visible", timeout: 5000 });
  await card.click();
  return card;
}

async function clickAddon(page, label) {
  const card = page
    .locator("#addonList .addon-card")
    .filter({ hasText: label })
    .first();
  await card.waitFor({ state: "visible", timeout: 5000 });
  await card.click();
}

async function runPersona(page, persona) {
  await page.goto(`${BASE}/estimate/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".estimator-widget");

  await clickCard(page, persona.type);

  if (persona.scope) {
    await page.locator("#stepScope").waitFor({ state: "visible" });
    await clickCard(page, persona.scope, "#stepScope");

    const sizeCards = page.locator("#sizeCards .estimator-card");
    await sizeCards.first().waitFor({ state: "visible", timeout: 5000 });
    if ((await sizeCards.count()) === 0) {
      throw new Error(
        `Size cards did not render after scope for ${persona.name}`,
      );
    }
  } else {
    const sizeCards = page.locator("#sizeCards .estimator-card");
    await sizeCards.first().waitFor({ state: "visible", timeout: 5000 });
    if ((await sizeCards.count()) === 0) {
      throw new Error(`Size cards did not render for ${persona.name}`);
    }
  }

  await clickCard(page, persona.size, "#stepSize");
  const selectedSize = page
    .locator("#sizeCards .estimator-card.selected")
    .filter({ hasText: persona.size });
  if ((await selectedSize.count()) !== 1) {
    throw new Error(
      `Size card "${persona.size}" missing selected state for ${persona.name}`,
    );
  }

  await clickCard(page, persona.finish, "#stepFinish");

  if (persona.addons?.length) {
    for (const addon of persona.addons) {
      await clickAddon(page, addon);
    }
    const selectedAddons = page.locator("#addonList .addon-card.selected");
    if ((await selectedAddons.count()) !== persona.addons.length) {
      throw new Error(`Addon selection failed for ${persona.name}`);
    }
  }

  const result = page.locator("#estimateResult");
  await result.waitFor({ state: "visible", timeout: 5000 });

  const rangeText = await page.locator("#resultRange").textContent();
  if (!persona.expectRange.test(rangeText || "")) {
    throw new Error(`Bad range for ${persona.name}: ${rangeText}`);
  }

  return rangeText?.trim();
}

async function testSaveApi(page) {
  await page.goto(`${BASE}/estimate/`, { waitUntil: "networkidle" });
  await clickCard(page, "Basement");
  await clickCard(page, "Full Renovation");
  await clickCard(page, "800–1,000 sq ft");
  await clickCard(page, "Mid-Range");
  await page.waitForSelector("#estimateResult:not(.d-none)");

  const saveRes = await page.evaluate(async () => {
    const widget = document.querySelector(".estimator-widget");
    const btn = document.querySelector("#ctaQuote");
    if (!btn) return { error: "no cta" };
    return new Promise((resolve) => {
      const orig = window.location.href;
      let navigated = false;
      const observer = setInterval(() => {
        if (window.location.href !== orig) {
          navigated = true;
          clearInterval(observer);
          resolve({ url: window.location.href });
        }
      }, 100);
      btn.click();
      setTimeout(() => {
        clearInterval(observer);
        if (!navigated)
          resolve({ error: "no navigation", href: window.location.href });
      }, 5000);
    });
  });

  return saveRes;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  try {
    for (const persona of PERSONAS) {
      const range = await runPersona(page, persona);
      results.push({ persona: persona.name, status: "PASS", range });
      console.log(`PASS | ${persona.name} → ${range}`);
    }

    // Saved estimate page
    const savePayload = {
      type: "basement",
      typeLabel: "Basement Renovation",
      scope: "legal-suite",
      scopeLabel: "Legal Secondary Suite",
      size: "medium",
      sizeLabel: "800–1,000 sq ft",
      finish: "mid",
      finishLabel: "Mid-Range",
      addons: [],
      addonLabels: [],
      min: 130000,
      max: 170000,
      breakdown: [{ label: "Base", range: [130000, 170000] }],
      selections: [
        {
          step: "base",
          question: "Base",
          answer: "Legal",
          range: [130000, 170000],
        },
        {
          step: "project",
          question: "What are you renovating?",
          answer: "Basement Renovation",
          range: [0, 0],
          image: "/assets/img/basement/estimator/basement.svg",
          imageAlt: "Finished basement renovation in Hamilton",
        },
      ],
      market: "Hamilton & Burlington",
      hstNote: "All ranges exclude 13% HST.",
      contingencyNote: "15% contingency",
    };

    const saveRes = await page.request.post(`${BASE}/api/estimates/save/`, {
      data: savePayload,
    });
    if (!saveRes.ok()) throw new Error(`Save API failed: ${saveRes.status()}`);
    const { id, url } = await saveRes.json();
    if (!id) throw new Error("Save API returned no id");

    const savedPage = await page.goto(
      url.replace("https://www.mtcrenovations.ca", BASE),
      {
        waitUntil: "networkidle",
      },
    );
    if (!savedPage || savedPage.status() !== 200) {
      throw new Error(`Saved page failed: ${savedPage?.status()}`);
    }
    const savedText = await page.textContent("body");
    if (!savedText?.includes("$130,000") || !savedText?.includes("$170,000")) {
      throw new Error("Saved page missing estimate range");
    }
    const thumb = await page.locator(".estimator-thumb").count();
    if (thumb < 1) throw new Error("Saved page missing breakdown thumbnails");
    console.log(`PASS | saved estimate page → ${id}`);

    const leadPage = await page.goto(`${BASE}/newleadintake/?estimate=${id}`, {
      waitUntil: "networkidle",
    });
    if (!leadPage || leadPage.status() !== 200)
      throw new Error("Lead page failed");
    await page.waitForFunction(
      (estimateId) => {
        const notes = document.querySelector("#projectNotes");
        return notes && notes.value.includes("130,000");
      },
      id,
      { timeout: 5000 },
    );
    const notes = await page.inputValue("#projectNotes");
    if (!notes.includes("130,000"))
      throw new Error("Lead form not prefilled from estimate");
    console.log(`PASS | lead form prefill → estimate ${id}`);

    // Save & Email API (REST token + Email Sending domain required for emailSent=true)
    await page.goto(`${BASE}/estimate/`, { waitUntil: "networkidle" });
    await clickCard(page, "Bathroom");
    await clickCard(page, "Main Bathroom", "#stepSize");
    await clickCard(page, "Mid-Range", "#stepFinish");
    await page.waitForSelector("#estimateResult:not(.d-none)");
    const saveEmailRes = await page.evaluate(async () => {
      const widget = document.querySelector(".estimator-widget");
      if (!widget) return { error: "no widget" };
      const pricing = JSON.parse(widget.getAttribute("data-pricing") || "{}");
      const payload = {
        type: "bathroom",
        typeLabel: "Bathroom Renovation",
        size: "main",
        sizeLabel: "Main Bathroom",
        finish: "mid",
        finishLabel: "Mid-Range",
        addons: [],
        addonLabels: [],
        min: 22000,
        max: 38000,
        breakdown: [{ label: "Base", range: [22000, 38000] }],
        selections: [],
        market: pricing.meta?.market || "Hamilton & Burlington",
        hstNote: pricing.meta?.hstNote || "",
        contingencyNote: pricing.meta?.contingencyNote || "",
        email: "estimator-test@mtcrenovations.ca",
      };
      const res = await fetch("/api/estimates/save/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await res.json() };
    });
    if (saveEmailRes.status !== 200 || !saveEmailRes.body?.id) {
      throw new Error(
        `Save & Email API failed: ${JSON.stringify(saveEmailRes)}`,
      );
    }
    console.log(
      `PASS | save & email API → id=${saveEmailRes.body.id} emailSent=${saveEmailRes.body.emailSent}`,
    );

    // Save & Email UI (Playwright click path)
    await page.goto(`${BASE}/estimate/`, { waitUntil: "networkidle" });
    await clickCard(page, "Bathroom");
    await clickCard(page, "Powder Room", "#stepSize");
    await clickCard(page, "Mid-Range", "#stepFinish");
    await page.waitForSelector("#estimateResult:not(.d-none)");
    await page.fill("#estimateEmail", "estimator-ui-test@mtcrenovations.ca");
    await page.click("#ctaEmailSave");
    await page.waitForFunction(
      () => {
        const status = document.querySelector("#emailSaveStatus");
        return (
          status &&
          !status.classList.contains("d-none") &&
          !status.textContent?.includes("Could not save estimate")
        );
      },
      { timeout: 15000 },
    );
    const uiStatus = await page.textContent("#emailSaveStatus");
    if (uiStatus?.includes("Could not save estimate")) {
      throw new Error(`Save & Email UI failed: ${uiStatus}`);
    }
    console.log(`PASS | save & email UI → ${uiStatus?.trim().slice(0, 80)}...`);

    // Lead submit → JobTread sync (when credentials configured in env)
    const leadRes = await page.request.post(`${BASE}/api/leads/submit/`, {
      data: {
        estimateId: saveEmailRes.body.id,
        name: "Price Guide Test Lead",
        email: "estimator-test@mtcrenovations.ca",
        phone: "647-555-0199",
        address: "123 Test Street, Hamilton, ON",
        hearAbout: "Price Guide",
        projectNotes: "Automated Playwright test — safe to delete in JobTread.",
      },
    });
    if (!leadRes.ok())
      throw new Error(`Lead submit failed: ${leadRes.status()}`);
    const leadJson = await leadRes.json();
    if (!leadJson.success)
      throw new Error("Lead submit returned success=false");
    console.log(
      `PASS | lead submit → syncPending=${leadJson.syncPending} jobId=${leadJson.jobTread?.jobId || "none"}`,
    );

    console.log(
      `\nResult: ${results.length + 3}/${PERSONAS.length + 3} checks passed`,
    );
  } catch (err) {
    console.error(`FAIL | ${err.message}`);
    await page.screenshot({ path: "/tmp/estimator-fail.png", fullPage: true });
    console.error("Screenshot: /tmp/estimator-fail.png");
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
