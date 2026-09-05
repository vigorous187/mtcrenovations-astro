import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookies = new Map((request.headers.get('cookie') || '').split(';').map(part => {
    const separator = part.indexOf('=');
    return [part.slice(0, separator).trim(), part.slice(separator + 1)];
  }));
  let consent: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(decodeURIComponent(cookies.get('cf_consent') || '{}'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) consent = parsed;
  } catch { /* Missing or malformed consent does not grant optional storage. */ }

  const expired = [
    ...(consent.analytics === true ? [] : ['cfz_google-analytics_v4', 'cfzs_google-analytics_v4']),
    ...(consent.advertising === true ? [] : ['_fbp']),
  ];
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of expired) {
    if (!cookies.has(name)) continue;
    const value = `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
    headers.append('Set-Cookie', value);
    headers.append('Set-Cookie', `${value}; Domain=.mtcrenovations.ca`);
  }
  return new Response(null, { status: 204, headers });
};
