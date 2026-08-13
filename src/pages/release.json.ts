import type { APIRoute } from "astro";

export const prerender = true;

const commit = import.meta.env["PUBLIC_RELEASE_COMMIT"] || "local";
const branch = import.meta.env["PUBLIC_RELEASE_BRANCH"] || "local";

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ commit, branch }), {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
