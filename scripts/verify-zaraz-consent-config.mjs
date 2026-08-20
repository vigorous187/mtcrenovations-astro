import { pathToFileURL } from 'node:url';

export function auditZarazConfig(config) {
  const failures = [];
  if (config?.settings?.autoInjectScript !== false) failures.push('Zaraz autoInjectScript must be false');
  if (config?.consent?.enabled !== true) failures.push('Zaraz Consent Management must be enabled');
  if (config?.consent?.hideModal !== true) failures.push('Zaraz native modal must be hidden because the site owns the accessible UI');

  const purposes = config?.consent?.purposes ?? {};
  const purposeIds = new Set(Object.keys(purposes));
  if (purposeIds.size === 0) failures.push('At least one consent purpose must exist');

  for (const [id, tool] of Object.entries(config?.tools ?? {})) {
    if (!tool.defaultPurpose || !purposeIds.has(tool.defaultPurpose)) {
      failures.push(`Zaraz tool ${tool.name || id} must have a valid defaultPurpose`);
      continue;
    }
    const purposeName = String(purposes[tool.defaultPurpose]?.name || '').toLowerCase();
    if (!purposeName.includes('analytics')) failures.push(`Zaraz tool ${tool.name || id} must use the Analytics purpose`);
  }
  if (config?.analytics?.enabled && (!config.analytics.defaultPurpose || !purposeIds.has(config.analytics.defaultPurpose))) {
    failures.push('Zaraz Advanced Monitoring must have a valid defaultPurpose');
  }
  return failures;
}

async function main() {
  const token = process.env.CLOUDFLARE_ZARAZ_READ_TOKEN;
  const zoneId = process.env.MTC_CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) throw new Error('CLOUDFLARE_ZARAZ_READ_TOKEN and MTC_CLOUDFLARE_ZONE_ID are required');
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/zaraz/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Cloudflare Zaraz read failed with HTTP ${response.status}`);
  const body = await response.json();
  if (!body.success) throw new Error('Cloudflare Zaraz read returned an unsuccessful response');
  const failures = auditZarazConfig(body.result);
  if (failures.length) throw new Error(`MTC consent release blocked:\n- ${failures.join('\n- ')}`);
  console.log('MTC Zaraz consent release preflight passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
