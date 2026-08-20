export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = 'mtc.consent.v1';
let memoryChoice = null;

export function parseConsent(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      value.version !== CONSENT_VERSION ||
      typeof value.updatedAt !== 'string' ||
      typeof value.analytics !== 'boolean' ||
      typeof value.advertising !== 'boolean'
    ) return null;
    return value;
  } catch {
    return null;
  }
}

export function googleConsent(choice) {
  return {
    analytics_storage: choice?.analytics ? 'granted' : 'denied',
    ad_storage: choice?.advertising ? 'granted' : 'denied',
    ad_user_data: choice?.advertising ? 'granted' : 'denied',
    ad_personalization: choice?.advertising ? 'granted' : 'denied',
  };
}

export function getConsent() {
  try {
    return parseConsent(localStorage.getItem(CONSENT_STORAGE_KEY)) ?? memoryChoice;
  } catch {
    return memoryChoice;
  }
}

function updateConsent(choice) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'update', googleConsent(choice));

  applyZarazConsent(choice);
  if (!choice.advertising && window.fbq) window.fbq('consent', 'revoke');
}

function applyZarazConsent(choice) {
  if (!window.zaraz?.set) return;
  const denied = googleConsent(null);
  window.zaraz.set('google_consent_default', denied, { scope: 'page' });
  window.zaraz.set('google_consent_update', googleConsent(choice), { scope: 'page' });
  if (window.zaraz.consent?.APIReady) {
    window.zaraz.consent.setAll(Boolean(choice.analytics));
    if (choice.analytics) window.zaraz.consent.sendQueuedEvents();
  }
}

function loadZarazOnce(choice) {
  if (document.querySelector('script[data-consent-managed="zaraz"]')) return;
  const script = document.createElement('script');
  script.src = '/cdn-cgi/zaraz/i.js';
  script.referrerPolicy = 'origin';
  script.dataset.consentManaged = 'zaraz';
  script.addEventListener('load', () => applyZarazConsent(choice), { once: true });
  document.head.appendChild(script);
}

function loadMetaOnce() {
  if (document.querySelector('script[data-consent-managed="meta"]')) return;
  window.fbq = window.fbq || function () { window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments); };
  window.fbq.queue = window.fbq.queue || [];
  window.fbq.loaded = true;
  window.fbq.version = '2.0';
  window.fbq('consent', 'grant');
  window.fbq('init', '1574962723611289');
  window.fbq('track', 'PageView');
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  script.dataset.consentManaged = 'meta';
  document.head.appendChild(script);
}

function activate(choice) {
  updateConsent(choice);
  if (choice.analytics) loadZarazOnce(choice);
  if (choice.advertising) loadMetaOnce();
}

export function initConsentManager() {
  const banner = document.querySelector('[data-consent-banner]');
  const dialog = document.querySelector('[data-consent-dialog]');
  const analytics = dialog?.querySelector('[name="consent-analytics"]');
  const advertising = dialog?.querySelector('[name="consent-advertising"]');
  const reload = document.querySelector('[data-consent-reload]');
  let current = getConsent();
  window.mtcConsentAllowed = (purpose) => getConsent()?.[purpose] === true;

  const render = () => {
    if (banner) banner.hidden = Boolean(current);
    if (analytics) analytics.checked = current?.analytics ?? false;
    if (advertising) advertising.checked = current?.advertising ?? false;
  };
  const save = (next) => {
    const hadLoadedScripts = Boolean(document.querySelector('script[data-consent-managed]'));
    const revoked = hadLoadedScripts && Boolean(
      (current?.analytics && !next.analytics) || (current?.advertising && !next.advertising)
    );
    current = { version: CONSENT_VERSION, updatedAt: new Date().toISOString(), ...next };
    memoryChoice = current;
    try { localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(current)); } catch {}
    activate(current);
    dialog?.close();
    if (reload) reload.hidden = !revoked;
    render();
    window.dispatchEvent(new CustomEvent('mtc:consent-changed', { detail: current }));
  };

  document.querySelectorAll('[data-consent-accept]').forEach((button) => button.addEventListener('click', () => save({ analytics: true, advertising: true })));
  document.querySelectorAll('[data-consent-reject]').forEach((button) => button.addEventListener('click', () => save({ analytics: false, advertising: false })));
  document.querySelectorAll('[data-consent-open]').forEach((button) => button.addEventListener('click', () => dialog?.showModal()));
  dialog?.querySelector('[data-consent-save]')?.addEventListener('click', () => save({ analytics: analytics.checked, advertising: advertising.checked }));
  dialog?.querySelector('[data-consent-cancel]')?.addEventListener('click', () => dialog.close());
  reload?.querySelector('button')?.addEventListener('click', () => window.location.reload());

  render();
  if (current) activate(current);
}
