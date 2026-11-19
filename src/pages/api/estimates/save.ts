import type { APIRoute } from "astro";
import { sendEstimateEmail } from "../../../lib/email";
import type {
  EstimateSaveInput,
  SavedEstimate,
} from "../../../lib/estimate-types";

export const prerender = false;

const TTL_SECONDS = 90 * 24 * 60 * 60;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isValidInput(body: EstimateSaveInput): boolean {
  return Boolean(
    body.type &&
    body.typeLabel &&
    body.size &&
    body.sizeLabel &&
    body.finish &&
    body.finishLabel &&
    typeof body.min === "number" &&
    typeof body.max === "number" &&
    body.min > 0 &&
    body.max >= body.min &&
    Array.isArray(body.breakdown) &&
    Array.isArray(body.selections),
  );
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = locals.runtime.env;
    const kv = env.ESTIMATES;
    if (!kv) return json({ error: "Storage not configured" }, 503);

    const body = (await request.json()) as EstimateSaveInput;
    if (!isValidInput(body))
      return json({ error: "Invalid estimate payload" }, 400);

    const id = crypto.randomUUID();
    const siteUrl = env.SITE_URL || "https://www.mtcrenovations.ca";

    const estimate: SavedEstimate = {
      id,
      type: body.type,
      typeLabel: body.typeLabel,
      scope: body.scope ?? null,
      scopeLabel: body.scopeLabel ?? null,
      size: body.size,
      sizeLabel: body.sizeLabel,
      finish: body.finish,
      finishLabel: body.finishLabel,
      addons: body.addons ?? [],
      addonLabels: body.addonLabels ?? [],
      min: body.min,
      max: body.max,
      breakdown: body.breakdown,
      selections: body.selections,
      market: body.market,
      hstNote: body.hstNote,
      contingencyNote: body.contingencyNote,
      createdAt: new Date().toISOString(),
      email: body.email?.trim() || undefined,
      name: body.name?.trim() || undefined,
    };

    await kv.put(`estimate:${id}`, JSON.stringify(estimate), {
      expirationTtl: TTL_SECONDS,
    });

    let emailSent = false;
    if (estimate.email) {
      const emailResult = await sendEstimateEmail(
        estimate,
        estimate.email,
        env,
      );
      emailSent = emailResult.ok;
      if (!emailResult.ok) {
        console.error("estimate email failed", emailResult);
      }
    }

    return json({
      id,
      url: `${siteUrl}/estimate/s/${id}/`,
      emailSent,
    });
  } catch (err) {
    console.error("estimate save error", err);
    return json({ error: "Failed to save estimate" }, 500);
  }
};
