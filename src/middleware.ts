import { defineMiddleware } from "astro:middleware";

// Slashless SSR routes never match trailingSlash: "always".
// Do not put this in public/_redirects — Pages _redirects beat Functions
// and 404 the slashed Worker page (see reverted PR #19).
export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);
  if (url.pathname === "/newleadintake") {
    return context.redirect(`/newleadintake/${url.search}`, 301);
  }
  return next();
});
