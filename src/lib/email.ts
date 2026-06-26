import site from "../data/site.json";
import { fmtCad } from "./estimate-format";
import type { SavedEstimate } from "./estimate-types";

const FROM = "MTC Renovations <info@mtcrenovations.ca>";

function siteUrl(env?: { SITE_URL?: string }): string {
  return env?.SITE_URL || site.url;
}

export async function sendEstimateEmail(
  estimate: SavedEstimate,
  to: string,
  env: { RESEND_API_KEY?: string; SITE_URL?: string },
): Promise<boolean> {
  const key = env.RESEND_API_KEY;
  if (!key) return false;

  const url = `${siteUrl(env)}/estimate/s/${estimate.id}/`;
  const name = estimate.name?.split(" ")[0] || "there";

  const html = `
    <p>Hi ${name},</p>
    <p>Your personalized price estimate is ready.</p>
    <p><strong>View Your Price Estimate:</strong><br>
    <a href="${url}">${url}</a></p>
    <p>This link is your gateway back to your estimate anytime you need it.</p>
    <p><strong>Your range:</strong> ${fmtCad(estimate.min)} – ${fmtCad(estimate.max)} (excl. HST)<br>
    <strong>Project:</strong> ${estimate.typeLabel}${estimate.scopeLabel ? ` · ${estimate.scopeLabel}` : ""}</p>
    <p>This is a ballpark figure — not a fixed quote. We'll be happy to discuss specifics and prepare an accurate quote for your home.</p>
    <p>Call us at <a href="tel:${site.phone.replace(/\D/g, "")}">${site.phone}</a> or <a href="${siteUrl(env)}/newleadintake/?estimate=${estimate.id}">request a free quote</a>.</p>
    <p>Best wishes,<br>MTC Renovations</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: "Your MTC Price Guide estimate",
      html,
    }),
  });

  return res.ok;
}

export async function sendLeadConfirmationEmail(
  estimate: SavedEstimate | null,
  lead: { name: string; email: string },
  env: { RESEND_API_KEY?: string; SITE_URL?: string },
): Promise<boolean> {
  const key = env.RESEND_API_KEY;
  if (!key) return false;

  const firstName = lead.name.split(" ")[0] || "there";
  const estimateBlock = estimate
    ? `<p><strong>Your saved estimate:</strong> <a href="${siteUrl(env)}/estimate/s/${estimate.id}/">${fmtCad(estimate.min)} – ${fmtCad(estimate.max)}</a></p>`
    : "";

  const html = `
    <p>Hi ${firstName},</p>
    <p>Thank you for reaching out to MTC Renovations. We received your quote request and will get back to you within 24 hours.</p>
    ${estimateBlock}
    <p>If you'd like to reach us sooner, call <a href="tel:${site.phone.replace(/\D/g, "")}">${site.phone}</a>.</p>
    <p>Best wishes,<br>MTC Renovations</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [lead.email],
      subject: "We received your quote request — MTC Renovations",
      html,
    }),
  });

  return res.ok;
}
