/**
 * /newleadintake/ copies name, email, city, and phone from the query string
 * into empty form controls via the value property.
 *
 * Manual check (local preview, do not submit):
 * /newleadintake/?name=Ann%20%26%20Bob&email=a%2Bb%40example.com&city=St.%20John's&phone=%2B19055550199&estimate=abc&source=price-guide
 * Expect Name, Email, and Phone filled; Address filled with the city;
 * How did you hear about us still follows estimate/source; page source has no injected markup.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  LEAD_INTAKE_QUERY_LIMITS,
  leadIntakeQueryValues,
} from "../src/lib/lead-intake-query.mjs";

const page = readFileSync(
  path.join(process.cwd(), "src/pages/newleadintake.astro"),
  "utf8",
);

test("missing params stay empty and values are trimmed", () => {
  assert.deepEqual(leadIntakeQueryValues(new URLSearchParams()), {
    name: "",
    email: "",
    phone: "",
    city: "",
  });

  const values = leadIntakeQueryValues(new URLSearchParams(
    "name=%20Ann%20%26%20Bob%20&email=%20a%2Bb%40example.com%20&phone=%20%2B19055550199%20&city=%20St.%20John's%20",
  ));
  assert.deepEqual(values, {
    name: "Ann & Bob",
    email: "a+b@example.com",
    phone: "+19055550199",
    city: "St. John's",
  });
});

test("values are length-limited and markup stays text", () => {
  const markup = "<script>alert(1)</script><img src=x onerror=alert(1)>";
  const values = leadIntakeQueryValues(new URLSearchParams({
    name: `  ${"N".repeat(200)}  `,
    email: `${"e".repeat(300)}@example.com`,
    phone: ` ${"1".repeat(80)} `,
    city: ` ${markup}${"C".repeat(200)} `,
  }));

  assert.equal(values.name.length, LEAD_INTAKE_QUERY_LIMITS.name);
  assert.equal(values.email.length, LEAD_INTAKE_QUERY_LIMITS.email);
  assert.equal(values.phone.length, LEAD_INTAKE_QUERY_LIMITS.phone);
  assert.equal(values.city.length, LEAD_INTAKE_QUERY_LIMITS.city);
  assert.equal(values.name, "N".repeat(LEAD_INTAKE_QUERY_LIMITS.name));
  assert.ok(values.city.startsWith(markup));
  assert.equal(values.city.includes("alert(1)"), true);
});

test("estimate and source are not copied into contact fields", () => {
  const values = leadIntakeQueryValues(new URLSearchParams(
    "estimate=abc&source=price-guide",
  ));
  assert.deepEqual(values, { name: "", email: "", phone: "", city: "" });
});

test("the intake page assigns query text with .value and leaves estimate/source reads in place", () => {
  const script = page.slice(page.indexOf("<script>"));
  assert.match(script, /leadIntakeQueryValues\(params\)/);
  assert.match(script, /const estimateId = params\.get\('estimate'\) \|\| '';/);
  assert.match(script, /const source = params\.get\('source'\) \|\| '';/);
  assert.match(script, /fillEmptyField\('name', queryLead\.name\)/);
  assert.match(script, /fillEmptyField\('email', queryLead\.email\)/);
  assert.match(script, /fillEmptyField\('phone', queryLead\.phone\)/);
  assert.match(script, /fillEmptyField\('address', queryLead\.city\)/);
  assert.match(script, /el\.value = value/);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  assert.doesNotMatch(page, /noindex=\{false\}/);
});
