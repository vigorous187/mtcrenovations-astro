import site from "../data/site.json";
import { fmtCad } from "./estimate-format";
import type { CloudflareEnv, SavedEstimate } from "./estimate-types";

const FROM = { email: "info@mtcrenovations.ca", name: "MTC Renovations" };
const DEFAULT_ACCOUNT_ID = "29adb2b788e4c6151ba90c43d19bbdb7";

function siteUrl(env?: { SITE_URL?: string }): string {
  return env?.SITE_URL || site.url;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailSendResult =
  | { ok: true }
  | { ok: false; reason: "missing_token" | "api_error"; detail?: string };

async function sendViaRestApi(
  env: CloudflareEnv,
  payload: EmailPayload,
): Promise<EmailSendResult> {
  const token = env.CLOUDFLARE_EMAIL_API_TOKEN;
  if (!token) return { ok: false, reason: "missing_token" };

  const accountId = env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID;
  const replyTo = site.email || FROM.email;

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: payload.to,
          from: FROM.email,
          reply_to: replyTo,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      },
    );

    const data = (await res.json()) as {
      success?: boolean;
      errors?: Array<{ code?: number; message?: string }>;
    };

    if (!res.ok || !data.success) {
      const detail = data.errors?.[0]?.message || `HTTP ${res.status}`;
      console.error("Cloudflare Email REST API failed", {
        status: res.status,
        errors: data.errors,
      });
      return { ok: false, reason: "api_error", detail };
    }

    return { ok: true };
  } catch (err) {
    console.error("Cloudflare Email REST API request failed", err);
    return {
      ok: false,
      reason: "api_error",
      detail: err instanceof Error ? err.message : "request_failed",
    };
  }
}

async function sendViaBinding(
  env: CloudflareEnv,
  payload: EmailPayload,
): Promise<boolean> {
  if (!env.EMAIL) return false;

  try {
    await env.EMAIL.send({
      to: payload.to,
      from: FROM,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: site.email || FROM.email,
    });
    return true;
  } catch (err) {
    console.error("Cloudflare Email binding send failed", err);
    return false;
  }
}

async function sendMail(
  env: CloudflareEnv,
  to: string,
  subject: string,
  html: string,
): Promise<EmailSendResult> {
  const payload: EmailPayload = {
    to,
    subject,
    html,
    text: htmlToText(html),
  };

  const rest = await sendViaRestApi(env, payload);
  if (rest.ok) return rest;
  if (rest.reason === "api_error") return rest;

  if (await sendViaBinding(env, payload)) return { ok: true };

  console.warn(
    "Email not configured — set CLOUDFLARE_EMAIL_API_TOKEN on Pages (Email Sending: Edit) or bind EMAIL",
  );
  return rest;
}

export async function sendEstimateEmail(
  estimate: SavedEstimate,
  to: string,
  env: CloudflareEnv,
): Promise<EmailSendResult> {
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

  return sendMail(env, to, "Your MTC Price Guide estimate", html);
}

export async function sendLeadConfirmationEmail(
  estimate: SavedEstimate | null,
  lead: { name: string; email: string },
  env: CloudflareEnv,
): Promise<EmailSendResult> {
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

  return sendMail(
    env,
    lead.email,
    "We received your quote request — MTC Renovations",
    html,
  );
}
