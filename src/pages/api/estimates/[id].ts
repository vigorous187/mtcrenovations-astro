import type { APIRoute } from "astro";
import type { SavedEstimate } from "../../../lib/estimate-types";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const kv = locals.runtime.env.ESTIMATES;
  if (!kv) {
    return new Response(JSON.stringify({ error: "Storage not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const raw = await kv.get(`estimate:${id}`);
  if (!raw) {
    return new Response(JSON.stringify({ error: "Estimate not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const estimate = JSON.parse(raw) as SavedEstimate;
  return new Response(JSON.stringify(estimate), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=60",
    },
  });
};
